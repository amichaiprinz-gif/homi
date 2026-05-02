import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const householdId = member?.household_id ?? null

  const query = supabase
    .from('shopping_history')
    .select('id, created_at, items')
    .order('created_at', { ascending: false })
    .limit(10)

  const { data, error } = householdId
    ? await query.eq('household_id', householdId)
    : await query.eq('user_id', user.id).is('household_id', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  if (action === 'save') {
    const { items, household_id } = body
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'רשימה ריקה' }, { status: 400 })

    const { data, error } = await supabase
      .from('shopping_history')
      .insert({ user_id: user.id, household_id: household_id ?? null, items })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  if (action === 'delete') {
    const { id } = body
    await supabase.from('shopping_history').delete().eq('id', id).eq('user_id', user.id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
