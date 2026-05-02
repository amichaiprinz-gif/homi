import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — returns the household's current shopping_active state
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id, households(shopping_active)')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member?.household_id) return NextResponse.json({ household_id: null, shopping_active: false })

  const h = member.households as { shopping_active: boolean } | { shopping_active: boolean }[] | null
  const shopping_active = Array.isArray(h)
    ? (h[0]?.shopping_active ?? false)
    : (h?.shopping_active ?? false)

  return NextResponse.json({ household_id: member.household_id, shopping_active })
}

// POST — set shopping_active for the caller's household
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { active } = await request.json()

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member?.household_id) return NextResponse.json({ error: 'No household' }, { status: 400 })

  const { error } = await supabase
    .from('households')
    .update({ shopping_active: Boolean(active) })
    .eq('id', member.household_id)

  if (error) {
    console.error('[shopping/mode] update error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
