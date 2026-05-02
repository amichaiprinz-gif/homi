import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { unstable_cache } from 'next/cache'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import LeaderboardClient from './LeaderboardClient'

type LogEntry = { title: string; icon: string; done_at: string }
type LeaderEntry = {
  user_id: string
  display_name: string
  points: number
  task_count: number
  logs: LogEntry[]
}

// Heavy query: task_logs for a date range + per-member aggregation.
// Cached per (householdId, start, end) — uses the admin client so it works without request-scoped cookies.
const getCachedLeaderboardRange = unstable_cache(
  async (householdId: string, start: string, end: string): Promise<LeaderEntry[]> => {
    const supabase = createAdminClient()

    const [logsRes, membersRes] = await Promise.all([
      supabase
        .from('task_logs')
        .select('done_by, done_at, tasks(title, icon, points)')
        .gte('done_at', start)
        .lte('done_at', end)
        .order('done_at', { ascending: false }),
      supabase
        .from('household_members')
        .select('user_id, display_name')
        .eq('household_id', householdId),
    ])

    const logs = logsRes.data ?? []
    const members = membersRes.data ?? []

    const pointsMap = new Map<string, number>()
    const countMap = new Map<string, number>()
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

    return (members as { user_id: string; display_name: string }[])
      .map(m => ({
        user_id: m.user_id,
        display_name: m.display_name,
        points: pointsMap.get(m.user_id) ?? 0,
        task_count: countMap.get(m.user_id) ?? 0,
        logs: logsMap.get(m.user_id) ?? [],
      }))
      .sort((a, b) => b.points - a.points)
  },
  ['leaderboard-range'],
  { revalidate: 120 },
)

// Convenience wrapper for current-month (open-ended: end = far future)
const getCachedLeaderboardFull = (householdId: string, monthStart: string) =>
  getCachedLeaderboardRange(householdId, monthStart, '2099-12-31T23:59:59Z')

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberRows } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const householdId = memberRows?.[0]?.household_id ?? null

  if (!householdId) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <LeaderboardClient userId={user.id} entries={[]} month={currentMonth()} daysRemaining={null} noHousehold />
        <BottomNav />
      </div>
    )
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysRemaining = daysInMonth - now.getDate()

  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthStart = prevMonthDate.toISOString()
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()
  const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`

  const [entries, prevEntries] = await Promise.all([
    getCachedLeaderboardFull(householdId, monthStart),
    getCachedLeaderboardRange(householdId, prevMonthStart, prevMonthEnd),
  ])

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <LeaderboardClient
        userId={user.id}
        entries={entries}
        month={currentMonth()}
        daysRemaining={daysRemaining}
        prevEntries={prevEntries}
        prevMonth={prevMonth}
      />
      <BottomNav />
    </div>
  )
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
