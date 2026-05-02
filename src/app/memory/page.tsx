import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import MemoryClient from './MemoryClient'

export default async function MemoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const householdId = member?.household_id ?? null

  const entries = householdId
    ? (await createAdminClient()
        .from('bot_memory')
        .select('key, value, updated_at')
        .eq('household_id', householdId)
        .order('updated_at', { ascending: false })
      ).data ?? []
    : []

  return <MemoryClient initial={entries} />
}
