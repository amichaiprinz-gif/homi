import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import TasksClient from './TasksClient'

export default async function TasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const householdId = member?.household_id ?? null

  const [tasksRes, membersRes] = await Promise.all([
    householdId
      ? supabase.from('tasks').select('*').eq('household_id', householdId).order('created_at', { ascending: false })
      : supabase.from('tasks').select('*').order('created_at', { ascending: false }),
    householdId
      ? supabase.from('household_members').select('user_id, display_name').eq('household_id', householdId)
      : Promise.resolve({ data: [] }),
  ])

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <TasksClient
        tasks={tasksRes.data ?? []}
        userId={user.id}
        members={membersRes.data ?? []}
      />
      <BottomNav />
    </div>
  )
}
