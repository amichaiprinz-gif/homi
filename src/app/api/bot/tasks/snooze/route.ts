/**
 * POST /api/bot/tasks/snooze
 *
 * Postpone a task by fuzzy-matching its title and advancing next_due_at.
 * Used by Bob when the user says "דחה את [X] ל-[Y] ימים".
 *
 * Body: { title: string, days?: number }  (days defaults to 1)
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../../_auth'

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { title?: string; days?: number }
  const title = body.title?.trim()
  if (!title) return NextResponse.json({ error: 'חסר כותרת' }, { status: 400 })

  const snoozeMs = Math.min(Math.max(Number(body.days ?? 1), 1), 30) * 24 * 3_600_000

  const admin = createAdminClient()

  const { data: tasks } = await admin
    .from('tasks')
    .select('id, title, next_due_at')
    .eq('household_id', auth.householdId)
    .ilike('title', `%${title}%`)
    .limit(5)

  if (!tasks?.length) return NextResponse.json({ error: 'task_not_found', searched: title }, { status: 404 })

  const task = tasks.sort((a, b) => a.title.length - b.title.length)[0]

  // Snooze from current next_due_at (if it exists and is in the future) or from now
  const base = task.next_due_at && new Date(task.next_due_at) > new Date()
    ? new Date(task.next_due_at)
    : new Date()
  const newDue = new Date(base.getTime() + snoozeMs).toISOString()

  await admin.from('tasks').update({ next_due_at: newDue }).eq('id', task.id)

  return NextResponse.json({ ok: true, task: task.title, next_due_at: newDue })
}
