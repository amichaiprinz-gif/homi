import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { unstable_cache } from 'next/cache'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import DashboardClient from './DashboardClient'
import { getActiveRoutineEvent } from '@/lib/jewish-calendar'

type LeaderEntry = { user_id: string; display_name: string; points: number }

// Cached leaderboard: recomputed at most once every 5 minutes per household.
// Uses the service-role client so it doesn't rely on request-scoped cookies.
// Cache key includes householdId + monthStart so different households and months
// never share a result.
const getCachedLeaderboard = unstable_cache(
  async (householdId: string, monthStart: string): Promise<LeaderEntry[]> => {
    const supabase = createAdminClient()

    const { data: members } = await supabase
      .from('household_members')
      .select('user_id, display_name')
      .eq('household_id', householdId)

    if (!members?.length) return []

    const memberIds = members.map((m: { user_id: string }) => m.user_id)

    const { data: logs } = await supabase
      .from('task_logs')
      .select('done_by, tasks(points)')
      .in('done_by', memberIds)
      .gte('done_at', monthStart)

    const pointsMap = new Map<string, number>()
    for (const log of logs ?? []) {
      const pts = ((log.tasks as unknown) as { points: number } | null)?.points ?? 1
      pointsMap.set(log.done_by, (pointsMap.get(log.done_by) ?? 0) + pts)
    }

    return (members as { user_id: string; display_name: string }[])
      .map(m => ({ user_id: m.user_id, display_name: m.display_name, points: pointsMap.get(m.user_id) ?? 0 }))
      .sort((a, b) => b.points - a.points)
  },
  ['leaderboard'],
  { revalidate: 300 }, // 5 minutes
)

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberRows } = await supabase
    .from('household_members')
    .select('*, households(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const member = memberRows?.[0] ?? null
  const householdId = member?.household_id ?? null

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const weekStart = new Date(todayStart)
  weekStart.setDate(todayStart.getDate() - todayStart.getDay()) // Sunday

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  // Hebrew calendar routine prompt (non-blocking — failure returns null gracefully)
  const activeRoutine = await getActiveRoutineEvent(new Date()).catch(() => null)

  const [tasksRes, membersRes, recentLogsRes, leaderboard, weekLogsRes, shoppingRes] = await Promise.all([
    householdId
      ? supabase.from('tasks').select('*').eq('household_id', householdId).order('next_due_at', { ascending: true })
      : supabase.from('tasks').select('*').order('next_due_at', { ascending: true }),
    householdId
      ? supabase.from('household_members').select('user_id, display_name').eq('household_id', householdId)
      : Promise.resolve({ data: [] }),
    householdId
      ? supabase
          .from('task_logs')
          .select('done_by, done_at, tasks(title, icon)')
          .gte('done_at', todayStart.toISOString())
          .order('done_at', { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
    // Leaderboard is cached — served from memory on repeat navigations
    householdId
      ? getCachedLeaderboard(householdId, monthStart.toISOString())
      : Promise.resolve([] as LeaderEntry[]),
    // Weekly activity: count per day-of-week (Sun–Sat)
    householdId
      ? supabase
          .from('task_logs')
          .select('done_at')
          .gte('done_at', weekStart.toISOString())
          .lte('done_at', new Date().toISOString())
      : Promise.resolve({ data: [] }),
    // Shopping: pending items count for dashboard mini-widget
    householdId
      ? supabase.from('shopping_items').select('id', { count: 'exact', head: true }).eq('household_id', householdId).eq('done', false)
      : Promise.resolve({ count: 0 }),
  ])

  // Aggregate weekly logs into counts per day-of-week [Sun,Mon,...,Sat]
  const weekDayCounts: number[] = [0, 0, 0, 0, 0, 0, 0]
  for (const log of (weekLogsRes.data ?? []) as { done_at: string }[]) {
    const day = new Date(log.done_at).getDay()
    weekDayCounts[day] = (weekDayCounts[day] ?? 0) + 1
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <DashboardClient
        tasks={tasksRes.data ?? []}
        user={user}
        member={member}
        householdId={householdId}
        members={membersRes.data ?? []}
        recentLogs={recentLogsRes.data ?? []}
        initialLeaderboard={leaderboard}
        activeRoutine={activeRoutine ?? undefined}
        weekDayCounts={weekDayCounts}
        shoppingCount={(shoppingRes as { count: number | null }).count ?? 0}
      />
      <BottomNav />
    </div>
  )
}
