import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('household_members')
    .select('*, households(*)')
    .eq('user_id', user.id)
    .maybeSingle()

  const householdId = member?.household_id ?? null

  const { data: members } = householdId
    ? await supabase
        .from('household_members')
        .select('user_id, display_name, role')
        .eq('household_id', householdId)
    : { data: [] }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <SettingsClient user={user} member={member} members={members ?? []} />
      <BottomNav />
    </div>
  )
}
