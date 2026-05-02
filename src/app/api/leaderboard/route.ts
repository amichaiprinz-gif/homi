import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: memberRows } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const householdId = memberRows?.[0]?.household_id ?? null
  if (!householdId) return NextResponse.json({ entries: [], month: currentMonth() })

  // Get task_logs for the current month for tasks in this household
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [logsRes, membersRes] = await Promise.all([
    supabase
      .from('task_logs')
      .select('done_by, done_at, tasks(title, icon, points)')
      .gte('done_at', monthStart.toISOString())
      .order('done_at', { ascending: false }),
    supabase
      .from('household_members')
      .select('user_id, display_name')
      .eq('household_id', householdId),
  ])

  const logs = logsRes.data ?? []
  const members = membersRes.data ?? []

  // Aggregate points + collect log details per user (RLS ensures only household tasks)
  const pointsMap = new Map<string, number>()
  const countMap = new Map<string, number>()
  type LogEntry = { title: string; icon: string; done_at: string }
  const logsMap = new Map<string, LogEntry[]>()

  for (const log of logs) {
    const task = (log.tasks as unknown) as { title: string; icon: string; points: number } | null
    const pts = task?.points ?? 1
    pointsMap.set(log.done_by, (pointsMap.get(log.done_by) ?? 0) + pts)
    countMap.set(log.done_by, (countMap.get(log.done_by) ?? 0) + 1)
    if (task?.title) {
      const arr = logsMap.get(log.done_by) ?? []
      arr.push({ title: task.title, icon: task.icon ?? '✅', done_at: log.done_at })
      logsMap.set(log.done_by, arr)
    }
  }

  const entries = members
    .map(m => ({
      user_id: m.user_id,
      display_name: m.display_name,
      points: pointsMap.get(m.user_id) ?? 0,
      task_count: countMap.get(m.user_id) ?? 0,
      logs: logsMap.get(m.user_id) ?? [],
    }))
    .sort((a, b) => b.points - a.points)

  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysRemaining = daysInMonth - now.getDate()

  return NextResponse.json({ entries, month: currentMonth(), daysRemaining })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await request.json()
  if (action !== 'reset') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { error } = await supabase
    .from('task_logs')
    .delete()
    .gte('done_at', monthStart.toISOString())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
