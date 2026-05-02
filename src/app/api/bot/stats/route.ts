/**
 * GET /api/bot/stats — household weekly & monthly stats
 *
 * Rich context for Bob to generate smart summaries:
 *  - Weekly task completions by day and by member
 *  - Monthly leaderboard (points)
 *  - Budget progress vs limit
 *  - Overdue tasks
 *  - Shopping list status
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../_auth'

export async function GET(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const now = new Date()

  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  weekStart.setHours(0, 0, 0, 0)

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Step 1: get members (needed to filter task_logs)
  const { data: members } = await admin
    .from('household_members')
    .select('user_id, display_name')
    .eq('household_id', auth.householdId)

  const memberIds = (members ?? []).map(m => m.user_id)
  const nameMap = new Map((members ?? []).map(m => [m.user_id, m.display_name]))

  // Step 2: run everything in parallel
  const [weekLogsResult, monthLogsResult, overdueResult, shoppingResult, budgetResult, memoryResult] =
    await Promise.all([
      memberIds.length
        ? admin.from('task_logs').select('done_by, done_at').in('done_by', memberIds)
            .gte('done_at', weekStart.toISOString()).order('done_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      memberIds.length
        ? admin.from('task_logs').select('done_by, tasks(points)').in('done_by', memberIds)
            .gte('done_at', monthStart.toISOString())
        : Promise.resolve({ data: [] }),
      admin.from('tasks').select('id, title, next_due_at').eq('household_id', auth.householdId)
        .not('next_due_at', 'is', null).lt('next_due_at', now.toISOString()),
      admin.from('shopping_items').select('id, done').eq('household_id', auth.householdId),
      admin.from('budget_expenses').select('amount').eq('household_id', auth.householdId)
        .gte('expense_date', monthStart.toISOString().split('T')[0]),
      admin.from('bot_memory').select('value').eq('household_id', auth.householdId)
        .eq('key', 'budget_limit').maybeSingle(),
    ])

  // Weekly completions by day-of-week
  const byDay: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  const byMemberWeek = new Map<string, number>()
  for (const log of (weekLogsResult.data ?? []) as { done_by: string; done_at: string }[]) {
    const day = new Date(log.done_at).getDay()
    byDay[day] = (byDay[day] ?? 0) + 1
    byMemberWeek.set(log.done_by, (byMemberWeek.get(log.done_by) ?? 0) + 1)
  }

  // Monthly points by member
  const byMemberMonth = new Map<string, number>()
  for (const log of (monthLogsResult.data ?? []) as { done_by: string; tasks: unknown }[]) {
    const taskData = log.tasks as { points?: number } | { points?: number }[] | null
    const pts = Array.isArray(taskData) ? (taskData[0]?.points ?? 1) : ((taskData as { points?: number } | null)?.points ?? 1)
    byMemberMonth.set(log.done_by, (byMemberMonth.get(log.done_by) ?? 0) + pts)
  }

  let topMember: string | null = null
  let topPoints = 0
  for (const [uid, pts] of byMemberMonth) {
    if (pts > topPoints) { topPoints = pts; topMember = uid }
  }

  const budgetTotal = Math.round((budgetResult.data ?? []).reduce((s, e: { amount: number }) => s + (e.amount ?? 0), 0))
  const budgetLimit = (memoryResult.data as { value?: string } | null)?.value ? Number((memoryResult.data as { value: string }).value) : null

  const shopping = shoppingResult.data ?? []
  const pendingCount = shopping.filter((i: { done: boolean }) => !i.done).length
  const doneCount = shopping.filter((i: { done: boolean }) => i.done).length

  const DAY_NAMES_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

  return NextResponse.json({
    generated_at: now.toISOString(),
    week: {
      total: Object.values(byDay).reduce((s, v) => s + v, 0),
      by_day: Object.entries(byDay).map(([d, count]) => ({ day: DAY_NAMES_HE[Number(d)], count })),
      by_member: (members ?? []).map(m => ({
        name: m.display_name,
        count: byMemberWeek.get(m.user_id) ?? 0,
      })),
    },
    month: {
      leaderboard: (members ?? [])
        .map(m => ({ name: m.display_name, points: byMemberMonth.get(m.user_id) ?? 0 }))
        .sort((a, b) => b.points - a.points),
      top_performer: topMember ? (nameMap.get(topMember) ?? null) : null,
      top_points: topPoints,
    },
    tasks: {
      overdue_count: overdueResult.data?.length ?? 0,
      overdue_titles: (overdueResult.data ?? []).slice(0, 5).map((t: { title: string }) => t.title),
    },
    shopping: {
      pending_count: pendingCount,
      done_count: doneCount,
    },
    budget: {
      total: budgetTotal,
      limit: budgetLimit,
      percent_used: budgetLimit ? Math.round((budgetTotal / budgetLimit) * 100) : null,
      days_left: daysInMonth - now.getDate(),
      on_track: budgetLimit
        ? Math.round(budgetTotal / now.getDate() * daysInMonth) <= budgetLimit
        : null,
    },
  })
}
