import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import BulletinClient from './BulletinClient'

export default async function BulletinPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id, display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <BulletinClient userId={user.id} householdId={member?.household_id ?? null} />
      <BottomNav />
    </div>
  )
}
