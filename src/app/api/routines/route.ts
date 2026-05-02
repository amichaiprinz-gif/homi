import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/routines
// Handles routine task creation only. Templates live in client localStorage.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  // ── create_tasks: create one-time tasks for a routine ───────────────────────
  if (action === 'create_tasks') {
    const { routineType, eventTitle, tasks } = body as {
      routineType: string
      eventTitle: string
      tasks: Array<{ title: string; icon: string; category: string; points: number }>
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json({ error: 'No tasks provided' }, { status: 400 })
    }

    // Resolve household (or solo)
    const { data: member } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const householdId = member?.household_id ?? null

    // Create each enabled task as a one-time task
    const inserts = tasks
      .filter(t => t.title?.trim())
      .map(t => ({
        title: t.title.trim(),
        category: t.category ?? 'other',
        icon: t.icon ?? '📋',
        frequency_value: 1,
        frequency_unit: 'days',
        is_roborock: false,
        is_quick: false,
        assigned_to: null,
        points: Math.min(Math.max(Number(t.points) || 1, 1), 5),
        created_by: user.id,
        household_id: householdId,
        last_done_at: null,
        next_due_at: null,
        schedule_type: 'one_time',
        schedule_days: null,
        schedule_time: null,
        notify_before_hours: 0,
      }))

    // Idempotency guard: if most of these tasks were already created for this
    // household in the past 7 days, another household member already triggered
    // the routine — skip to avoid duplicates.
    const taskTitles = inserts.map(t => t.title)
    if (householdId) {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: existing } = await supabase
        .from('tasks')
        .select('title')
        .eq('household_id', householdId)
        .eq('schedule_type', 'one_time')
        .in('title', taskTitles)
        .gte('created_at', since)

      const threshold = Math.ceil(taskTitles.length * 0.5)
      if (existing && existing.length >= threshold) {
        console.log(`[routines] skipped duplicate: ${routineType} "${eventTitle}" household=${householdId} (${existing.length}/${taskTitles.length} tasks already exist)`)
        return NextResponse.json({ created: 0, skipped: true })
      }
    }

    const { data: created, error } = await supabase
      .from('tasks')
      .insert(inserts)
      .select('id, title')

    if (error) {
      console.error('[routines] create_tasks error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.log(`[routines] created ${created?.length ?? 0} tasks for ${routineType} "${eventTitle}" user=${user.id}`)
    return NextResponse.json({ created: created?.length ?? 0, tasks: created })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
