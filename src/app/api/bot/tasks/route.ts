/**
 * GET  /api/bot/tasks  — list overdue + upcoming tasks (next 7 days)
 * POST /api/bot/tasks  — add a task (quick or scheduled)
 *
 * POST body:
 *   title:            string  (required)
 *   is_quick:         boolean (default true — no recurring schedule)
 *   due_date:         ISO date string — sets a one-time due date / next_due_at
 *   frequency_days:   number  — creates a recurring task with this interval in days
 *   assigned_to:      user_id string (optional)
 *   points:           1–10 (default 1)
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeNextDue } from '@/lib/date'
import { botAuth } from '../_auth'

export const maxDuration = 10

export async function GET(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const in7days = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  const overdueStart = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const { data, error } = await admin
    .from('tasks')
    .select('id, title, icon, next_due_at, last_done_at, is_quick, points, assigned_to')
    .eq('household_id', auth.householdId)
    .or(`next_due_at.is.null,and(next_due_at.gte.${overdueStart},next_due_at.lte.${in7days})`)
    .order('next_due_at', { ascending: true })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = new Date()
  const result = (data ?? []).map(t => ({
    ...t,
    status: !t.next_due_at ? 'quick' : new Date(t.next_due_at) < now ? 'overdue' : 'upcoming',
  }))
  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    title?: string
    is_quick?: boolean
    due_date?: string
    frequency_days?: number
    assigned_to?: string
    points?: number
  }

  const title = body.title?.trim()
  if (!title) return NextResponse.json({ error: 'חסר כותרת' }, { status: 400 })

  const now = new Date()
  const isRecurring = (body.frequency_days ?? 0) > 0
  const isScheduled = !!body.due_date
  const isQuick = body.is_quick ?? (!isRecurring && !isScheduled)

  let nextDueAt: string | null = null
  let frequencyValue = 1
  let frequencyUnit: string = 'days'
  let scheduleType = 'recurring'

  if (isRecurring) {
    frequencyValue = Math.min(Math.max(Math.round(body.frequency_days!), 1), 365)
    nextDueAt = computeNextDue(frequencyValue, 'days', now)
    scheduleType = 'recurring'
  } else if (isScheduled) {
    nextDueAt = new Date(body.due_date!).toISOString()
    scheduleType = 'one_time'
    frequencyValue = 1
  }

  const points = body.points ? Math.min(Math.max(Number(body.points), 1), 10) : 1

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tasks')
    .insert({
      title,
      household_id: auth.householdId,
      is_quick: isQuick,
      frequency_value: frequencyValue,
      frequency_unit: frequencyUnit,
      schedule_type: scheduleType,
      next_due_at: nextDueAt,
      assigned_to: body.assigned_to || null,
      points,
    })
    .select('id, title, next_due_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[bot/tasks] added "${title}" household=${auth.householdId} next_due=${nextDueAt ?? 'quick'}`)
  return NextResponse.json(data)
}
