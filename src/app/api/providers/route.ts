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
    .single()

  const householdId = member?.household_id ?? null
  const query = supabase
    .from('service_providers')
    .select('*')
    .order('created_at', { ascending: false })

  const { data, error } = householdId
    ? await query.eq('household_id', householdId)
    : await query.eq('user_id', user.id).is('household_id', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  const householdId = member?.household_id ?? null

  if (action === 'add') {
    const { name, profession, phone, notes, last_used, last_cost, rating } = body
    const { data, error } = await supabase
      .from('service_providers')
      .insert({
        name, profession,
        phone: phone || null,
        notes: notes || null,
        last_used: last_used || null,
        last_cost: last_cost ? Number(last_cost) : null,
        rating: rating ? Number(rating) : null,
        user_id: user.id,
        household_id: householdId,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  if (action === 'update') {
    const { id, name, profession, phone, notes, last_used, last_cost, rating } = body
    const { data, error } = await supabase
      .from('service_providers')
      .update({
        name, profession,
        phone: phone || null,
        notes: notes || null,
        last_used: last_used || null,
        last_cost: last_cost ? Number(last_cost) : null,
        rating: rating ? Number(rating) : null,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  if (action === 'delete') {
    const { id } = body
    await supabase.from('service_providers').delete().eq('id', id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
