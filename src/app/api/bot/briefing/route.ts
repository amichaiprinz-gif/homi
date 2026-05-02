/**
 * GET /api/bot/briefing — unified daily briefing
 *
 * Returns in one call: overdue/upcoming tasks, pending shopping items,
 * and the current month's budget summary.
 * Bob uses this instead of making 3 separate calls.
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../_auth'

export const maxDuration = 15

export async function GET(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const now = new Date()

  // Run all queries in parallel
  // End of today in Jerusalem time (UTC+3): local 23:59:59 = UTC 20:59:59
  // Shift now by +3h to get "local date", then find its UTC midnight+21h
  const OFFSET_MS = 3 * 3_600_000
  const localNow = new Date(now.getTime() + OFFSET_MS)
  const endOfTodayUtc = new Date(
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + 1, 0, 0, 0) - OFFSET_MS - 1
  ).toISOString()

  const [tasksResult, shoppingResult, budgetResult, memoryResult, membersResult] = await Promise.all([
    // Tasks: overdue + due today only — no null due_date (quick/undated tasks excluded)
    admin
      .from('tasks')
      .select('id, title, icon, next_due_at, is_quick, points, assigned_to')
      .eq('household_id', auth.householdId)
      .not('next_due_at', 'is', null)
      .lte('next_due_at', endOfTodayUtc)
      .order('next_due_at', { ascending: true })
      .limit(15),

    // Shopping: pending items only
    admin
      .from('shopping_items')
      .select('id, text, quantity')
      .eq('household_id', auth.householdId)
      .eq('done', false)
      .order('created_at', { ascending: false }),

    // Budget: current month
    admin
      .from('budget_expenses')
      .select('amount, budget_categories(name)')
      .eq('household_id', auth.householdId)
      .gte('expense_date', new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]),

    // Memory: household facts
    admin
      .from('bot_memory')
      .select('key, value')
      .eq('household_id', auth.householdId)
      .order('updated_at', { ascending: false }),

    // Members: for resolving assigned_to UUIDs to names
    admin
      .from('household_members')
      .select('user_id, display_name')
      .eq('household_id', auth.householdId),
  ])

  // Build member name lookup
  const memberNames = new Map((membersResult.data ?? []).map(m => [m.user_id, m.display_name]))

  // Process tasks
  const tasks = tasksResult.data ?? []
  const overdue = tasks.filter(t => t.next_due_at && new Date(t.next_due_at) < now)
  const upcoming = tasks.filter(t => !t.next_due_at || new Date(t.next_due_at) >= now)

  // Process budget
  const expenses = budgetResult.data ?? []
  const budgetTotal = Math.round(expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0))
  const byCategory: Record<string, number> = {}
  for (const e of expenses) {
    const cat = (e.budget_categories as { name?: string } | null)?.name ?? 'כללי'
    byCategory[cat] = (byCategory[cat] ?? 0) + (e.amount ?? 0)
  }

  const memory = memoryResult.data ?? []
  console.log(`[bot/briefing] tasks=${tasks.length} shopping=${shoppingResult.data?.length ?? 0} budget=₪${budgetTotal} memory=${memory.length} household=${auth.householdId}`)

  return NextResponse.json({
    generated_at: now.toISOString(),
    tasks: {
      overdue: overdue.map(t => ({ title: t.title, icon: t.icon, due: t.next_due_at, assigned_to: t.assigned_to ? (memberNames.get(t.assigned_to) ?? t.assigned_to) : null })),
      upcoming: upcoming.map(t => ({ title: t.title, icon: t.icon, due: t.next_due_at, assigned_to: t.assigned_to ? (memberNames.get(t.assigned_to) ?? t.assigned_to) : null })),
      total: tasks.length,
    },
    shopping: {
      items: shoppingResult.data ?? [],
      count: shoppingResult.data?.length ?? 0,
    },
    budget: {
      total: budgetTotal,
      by_category: byCategory,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    },
    memory: Object.fromEntries(memory.map(m => [m.key, m.value])),
  })
}
