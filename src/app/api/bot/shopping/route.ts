/**
 * GET  /api/bot/shopping  — list pending shopping items
 * POST /api/bot/shopping  — add items
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../_auth'

export const maxDuration = 10

export async function GET(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('shopping_items')
    .select('id, text, quantity, done, category')
    .eq('household_id', auth.householdId)
    .eq('done', false)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    items?: { text: string; quantity?: string }[]
  }

  const items = (body.items ?? []).filter(i => i.text?.trim())
  if (!items.length) return NextResponse.json({ error: 'אין פריטים' }, { status: 400 })

  const admin = createAdminClient()

  // Deduplicate: skip items that already exist (case-insensitive, undone)
  const { data: existing } = await admin
    .from('shopping_items')
    .select('text')
    .eq('household_id', auth.householdId)
    .eq('done', false)

  const existingTexts = new Set((existing ?? []).map(e => e.text.trim().toLowerCase()))
  const newItems = items.filter(i => !existingTexts.has(i.text.trim().toLowerCase()))
  const skipped = items.length - newItems.length

  if (!newItems.length) {
    return NextResponse.json({ added: 0, skipped, message: 'כל הפריטים כבר ברשימה' })
  }

  const rows = newItems.map(i => ({
    text: i.text.trim(),
    quantity: i.quantity?.trim() || null,
    household_id: auth.householdId,
    done: false,
  }))

  const { data, error } = await admin
    .from('shopping_items')
    .insert(rows)
    .select('id, text, quantity')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[bot/shopping] added ${rows.length} items (skipped ${skipped} duplicates) household=${auth.householdId}`)
  return NextResponse.json({ added: data?.length ?? 0, skipped, items: data })
}
