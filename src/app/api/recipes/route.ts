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
    .from('recipes')
    .select('*, recipe_ingredients(id, name, quantity, unit, sort_order)')
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
    .maybeSingle()

  const householdId = member?.household_id ?? null

  if (action === 'add') {
    const { title, category, servings, prep_time, instructions, ingredients } = body
    const { data: recipe, error } = await supabase
      .from('recipes')
      .insert({
        title, category: category || 'other',
        servings: servings ? Number(servings) : null,
        prep_time: prep_time ? Number(prep_time) : null,
        instructions: instructions || null,
        user_id: user.id,
        household_id: householdId,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (ingredients?.length) {
      const rows = (ingredients as { name: string; quantity?: string; unit?: string }[]).map((ing, i) => ({
        recipe_id: recipe.id,
        name: ing.name,
        quantity: ing.quantity || null,
        unit: ing.unit || null,
        sort_order: i,
      }))
      await supabase.from('recipe_ingredients').insert(rows)
    }

    const { data: full } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(id, name, quantity, unit, sort_order)')
      .eq('id', recipe.id)
      .maybeSingle()

    if (!full) return NextResponse.json({ error: 'שגיאה בשמירת המתכון — נסה שוב' }, { status: 500 })
    return NextResponse.json(full)
  }

  if (action === 'update') {
    const { id, title, category, servings, prep_time, instructions, ingredients } = body
    const { error } = await supabase
      .from('recipes')
      .update({
        title, category: category || 'other',
        servings: servings ? Number(servings) : null,
        prep_time: prep_time ? Number(prep_time) : null,
        instructions: instructions || null,
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)
    if (ingredients?.length) {
      const rows = (ingredients as { name: string; quantity?: string; unit?: string }[]).map((ing, i) => ({
        recipe_id: id, name: ing.name, quantity: ing.quantity || null, unit: ing.unit || null, sort_order: i,
      }))
      await supabase.from('recipe_ingredients').insert(rows)
    }

    const { data: full } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(id, name, quantity, unit, sort_order)')
      .eq('id', id)
      .maybeSingle()
    if (!full) return NextResponse.json({ error: 'שגיאה בעדכון המתכון' }, { status: 500 })
    return NextResponse.json(full)
  }

  if (action === 'delete') {
    const { id } = body
    await supabase.from('recipes').delete().eq('id', id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
