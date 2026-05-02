import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import ShoppingClient from './ShoppingClient'

export default async function ShoppingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id, households(shopping_active)')
    .eq('user_id', user.id)
    .maybeSingle()

  const householdId = member?.household_id ?? null
  const h = member?.households as { shopping_active: boolean } | { shopping_active: boolean }[] | null
  const shoppingActive = Array.isArray(h) ? (h[0]?.shopping_active ?? false) : (h?.shopping_active ?? false)

  const itemsQuery = supabase
    .from('shopping_items')
    .select('id, text, done, quantity, note, category, user_id, household_id')
    .order('created_at', { ascending: false })

  const { data: items } = householdId
    ? await itemsQuery.eq('household_id', householdId)
    : await itemsQuery.eq('user_id', user.id).is('household_id', null)

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <ShoppingClient
        initialItems={items ?? []}
        initialHouseholdId={householdId}
        initialShoppingMode={shoppingActive}
      />
      <BottomNav />
    </div>
  )
}
