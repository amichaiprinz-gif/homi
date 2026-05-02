/**
 * POST /api/bot/tasks/assign
 *
 * Reassign a task to a household member by name (fuzzy match on both task and member).
 * Body: { title: string, to: string }
 *   title — partial task title
 *   to    — partial member display name
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../../_auth'

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { title?: string; to?: string }
  const title = body.title?.trim()
  const toName = body.to?.trim()
  if (!title || !toName) return NextResponse.json({ error: 'חסר title או to' }, { status: 400 })

  const admin = createAdminClient()

  // Resolve task and member in parallel
  const [tasksResult, membersResult] = await Promise.all([
    admin
      .from('tasks')
      .select('id, title, assigned_to')
      .eq('household_id', auth.householdId)
      .ilike('title', `%${title}%`)
      .limit(5),
    admin
      .from('household_members')
      .select('user_id, display_name')
      .eq('household_id', auth.householdId)
      .ilike('display_name', `%${toName}%`)
      .limit(5),
  ])

  const tasks = tasksResult.data ?? []
  const members = membersResult.data ?? []

  if (!tasks.length) return NextResponse.json({ error: 'task_not_found', searched: title }, { status: 404 })
  if (!members.length) return NextResponse.json({ error: 'member_not_found', searched: toName }, { status: 404 })

  // Best match = shortest (most specific)
  const task = tasks.sort((a, b) => a.title.length - b.title.length)[0]
  const member = members.sort((a, b) => a.display_name.length - b.display_name.length)[0]

  await admin.from('tasks').update({ assigned_to: member.user_id }).eq('id', task.id)

  return NextResponse.json({ ok: true, task: task.title, assigned_to: member.display_name })
}
