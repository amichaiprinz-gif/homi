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
    .from('shopping_items')
    .select('id, text, done, quantity, note, category, user_id, household_id')
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

  const { text, action, id, done, quantity, note, category } = await request.json()

  if (action === 'add') {
    const { data: member } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const householdId = member?.household_id ?? null

    // Check for duplicate (same text, not done, same household scope)
    const dupQuery = supabase
      .from('shopping_items')
      .select('id')
      .ilike('text', text.trim())
      .eq('done', false)
    const { data: existing } = householdId
      ? await dupQuery.eq('household_id', householdId)
      : await dupQuery.eq('user_id', user.id).is('household_id', null)

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'הפריט כבר קיים ברשימה', duplicate: true }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('shopping_items')
      .insert({
        text,
        quantity: quantity || null,
        note: note || null,
        category: category || null,
        user_id: user.id,
        household_id: householdId,
        done: false,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  if (action === 'edit') {
    const { data, error } = await supabase
      .from('shopping_items')
      .update({ text, quantity: quantity || null, note: note || null })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  if (action === 'toggle') {
    const { data, error } = await supabase
      .from('shopping_items')
      .update({ done })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  if (action === 'delete') {
    await supabase.from('shopping_items').delete().eq('id', id)
    return NextResponse.json({ success: true })
  }

  if (action === 'clear_done') {
    const { data: member } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const query = supabase.from('shopping_items').delete().eq('done', true)
    member?.household_id
      ? await query.eq('household_id', member.household_id)
      : await query.eq('user_id', user.id).is('household_id', null)

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
