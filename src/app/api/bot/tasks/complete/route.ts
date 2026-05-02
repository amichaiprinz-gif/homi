/**
 * POST /api/bot/tasks/complete
 *
 * Mark a task as done by title (fuzzy match).
 * Used by Bob when the user says "סימנתי X".
 *
 * Body: { title: string }
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeNextDue, computeNextDueWeekly } from '@/lib/date'
import { botAuth } from '../../_auth'

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title } = await req.json()
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const admin = createAdminClient()

  // Find tasks whose title contains the search string (case-insensitive)
  const { data: tasks } = await admin
    .from('tasks')
    .select('id, title, points, schedule_type, schedule_days, schedule_time, frequency_value, frequency_unit')
    .eq('household_id', auth.householdId)
    .ilike('title', `%${title}%`)
    .limit(5)

  if (!tasks?.length) {
    return NextResponse.json({ error: 'task_not_found', searched: title }, { status: 404 })
  }

  // Pick the closest match (shortest title = most specific)
  const task = tasks.sort((a, b) => a.title.length - b.title.length)[0]
  const now = new Date()
  const nowISO = now.toISOString()

  // Compute next_due_at — mirrors the logic in the regular app's action=done
  const schedType = task.schedule_type ?? 'recurring'
  let nextDue: string | null = null
  if (schedType === 'one_time') {
    nextDue = null
  } else if (schedType === 'weekly' && task.schedule_days?.length) {
    nextDue = computeNextDueWeekly(task.schedule_days, task.schedule_time ?? '08:00', now)
  } else {
    nextDue = computeNextDue(task.frequency_value, task.frequency_unit, now)
  }

  // Get a household member to attribute the log to
  const { data: member } = await admin
    .from('household_members')
    .select('user_id')
    .eq('household_id', auth.householdId)
    .limit(1)
    .maybeSingle()

  if (!member) return NextResponse.json({ error: 'no_household_member' }, { status: 500 })

  if (schedType === 'one_time') {
    // One-time tasks are deleted after completion
    await admin.from('task_logs').insert({ task_id: task.id, done_by: member.user_id, done_at: nowISO })
    await admin.from('tasks').delete().eq('id', task.id)
  } else {
    await Promise.all([
      admin.from('task_logs').insert({ task_id: task.id, done_by: member.user_id, done_at: nowISO }),
      admin.from('tasks').update({ last_done_at: nowISO, next_due_at: nextDue }).eq('id', task.id),
    ])
  }

  return NextResponse.json({ ok: true, task: task.title, points: task.points, next_due_at: nextDue })
}
