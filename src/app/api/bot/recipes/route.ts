/**
 * POST /api/bot/recipes — Bob saves a parsed recipe to the household.
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 *
 * Body:
 *   title        string   — recipe name
 *   category     string   — breakfast|lunch|dinner|dessert|snack|drink|shabbat|cooked_salad|fresh_salad|other
 *   servings     number?  — number of servings
 *   prep_time    number?  — prep time in minutes
 *   instructions string?  — full preparation steps
 *   ingredients  Array<{ name: string; quantity?: string; unit?: string }>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../_auth'

const VALID_CATEGORIES = [
  'breakfast', 'lunch', 'dinner', 'dessert', 'snack',
  'drink', 'shabbat', 'cooked_salad', 'fresh_salad', 'other',
]

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    title?: string
    category?: string
    servings?: unknown
    prep_time?: unknown
    instructions?: string
    ingredients?: { name?: string; quantity?: string; unit?: string }[]
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, category, servings, prep_time, instructions, ingredients } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const cat = VALID_CATEGORIES.includes(category ?? '') ? category! : 'other'

  const admin = createAdminClient()

  // Insert recipe row
  // Resolve a member user_id (recipes table requires non-null user_id)
  const { data: member } = await admin
    .from('household_members')
    .select('user_id')
    .eq('household_id', auth.householdId)
    .limit(1)
    .maybeSingle()
  const userId = member?.user_id ?? null
  if (!userId) return NextResponse.json({ error: 'No household members found' }, { status: 400 })

  const { data: recipe, error: recipeErr } = await admin
    .from('recipes')
    .insert({
      title: title.trim(),
      category: cat,
      servings: servings != null ? Number(servings) || null : null,
      prep_time: prep_time != null ? Number(prep_time) || null : null,
      instructions: instructions?.trim() || null,
      household_id: auth.householdId,
      user_id: userId,
    })
    .select('id, title, category')
    .single()

  if (recipeErr || !recipe) {
    console.error('[bot/recipes] insert error:', recipeErr?.message)
    return NextResponse.json({ error: recipeErr?.message ?? 'Failed to save recipe' }, { status: 500 })
  }

  // Insert ingredients
  const ingRows = (ingredients ?? [])
    .filter(i => i.name?.trim())
    .map((ing, idx) => ({
      recipe_id: recipe.id,
      name: String(ing.name).trim(),
      quantity: ing.quantity?.trim() || null,
      unit: ing.unit?.trim() || null,
      sort_order: idx,
    }))

  if (ingRows.length) {
    const { error: ingErr } = await admin.from('recipe_ingredients').insert(ingRows)
    if (ingErr) {
      console.error('[bot/recipes] ingredients insert error:', ingErr.message)
      // Recipe was saved — ingredients failed. Return partial success.
      return NextResponse.json({
        ok: true,
        id: recipe.id,
        title: recipe.title,
        category: recipe.category,
        ingredients_saved: 0,
        warning: 'Recipe saved but ingredients failed to save',
      })
    }
  }

  console.log(`[bot/recipes] saved: "${recipe.title}" (${cat}) id=${recipe.id} household=${auth.householdId} ingredients=${ingRows.length}`)

  return NextResponse.json({
    ok: true,
    id: recipe.id,
    title: recipe.title,
    category: recipe.category,
    ingredients_saved: ingRows.length,
  })
}
