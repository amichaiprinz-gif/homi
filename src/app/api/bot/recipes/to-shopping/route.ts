/**
 * POST /api/bot/recipes/to-shopping — Add recipe ingredients to the shopping list.
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 *
 * Body:
 *   title   string   — recipe name (partial/fuzzy match, case-insensitive)
 *   only_missing  boolean?  — if true (default), skip items already in shopping list
 *
 * Returns: { recipe, added, skipped, items }
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../../_auth'

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    title?: string
    only_missing?: boolean
  }

  const title = body.title?.trim()
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const onlyMissing = body.only_missing !== false // default true

  const admin = createAdminClient()

  // Find recipe by title (case-insensitive, partial match)
  const { data: recipes } = await admin
    .from('recipes')
    .select('id, title')
    .eq('household_id', auth.householdId)
    .ilike('title', `%${title}%`)
    .order('created_at', { ascending: false })
    .limit(5)

  if (!recipes?.length) {
    return NextResponse.json({
      error: `לא נמצא מתכון עם השם "${title}"`,
      hint: 'נסה חלק מהשם',
    }, { status: 404 })
  }

  // Use the closest match (first result, which has highest recency)
  // If multiple matches, prefer exact match
  const exact = recipes.find(r => r.title.toLowerCase() === title.toLowerCase())
  const recipe = exact ?? recipes[0]

  // Fetch ingredients
  const { data: ingredients, error: ingErr } = await admin
    .from('recipe_ingredients')
    .select('name, quantity, unit')
    .eq('recipe_id', recipe.id)
    .order('sort_order', { ascending: true })

  if (ingErr) return NextResponse.json({ error: ingErr.message }, { status: 500 })
  if (!ingredients?.length) {
    return NextResponse.json({
      recipe: recipe.title,
      added: 0,
      skipped: 0,
      message: 'למתכון הזה אין רשימת מצרכים',
    })
  }

  // Build shopping items text
  const toAdd = ingredients.map(ing => {
    const parts = [ing.name.trim()]
    if (ing.quantity) parts.push(ing.quantity)
    if (ing.unit) parts.push(ing.unit)
    return {
      text: ing.name.trim(),
      quantity: [ing.quantity, ing.unit].filter(Boolean).join(' ') || undefined,
    }
  })

  if (!onlyMissing) {
    // Add all ingredients regardless of duplicates
    const { data: added, error: addErr } = await admin
      .from('shopping_items')
      .insert(toAdd.map(i => ({
        text: i.text,
        quantity: i.quantity ?? null,
        household_id: auth.householdId,
        done: false,
      })))
      .select('id, text, quantity')

    if (addErr) return NextResponse.json({ error: addErr.message }, { status: 500 })

    console.log(`[bot/recipes/to-shopping] recipe="${recipe.title}" added=${added?.length ?? 0} (all, no dedup) household=${auth.householdId}`)
    return NextResponse.json({
      recipe: recipe.title,
      added: added?.length ?? 0,
      skipped: 0,
      items: added,
    })
  }

  // Deduplicate: skip items already in list (undone, case-insensitive)
  const { data: existing } = await admin
    .from('shopping_items')
    .select('text')
    .eq('household_id', auth.householdId)
    .eq('done', false)

  const existingTexts = new Set((existing ?? []).map(e => e.text.trim().toLowerCase()))
  const newItems = toAdd.filter(i => !existingTexts.has(i.text.toLowerCase()))
  const skipped = toAdd.length - newItems.length

  if (!newItems.length) {
    return NextResponse.json({
      recipe: recipe.title,
      added: 0,
      skipped,
      message: 'כל המצרכים כבר ברשימת הקניות',
    })
  }

  const { data: added, error: addErr } = await admin
    .from('shopping_items')
    .insert(newItems.map(i => ({
      text: i.text,
      quantity: i.quantity ?? null,
      household_id: auth.householdId,
      done: false,
    })))
    .select('id, text, quantity')

  if (addErr) return NextResponse.json({ error: addErr.message }, { status: 500 })

  console.log(`[bot/recipes/to-shopping] recipe="${recipe.title}" added=${added?.length ?? 0} skipped=${skipped} household=${auth.householdId}`)

  return NextResponse.json({
    recipe: recipe.title,
    added: added?.length ?? 0,
    skipped,
    items: added,
  })
}
