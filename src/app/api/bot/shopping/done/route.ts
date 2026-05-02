/**
 * POST /api/bot/shopping/done  — mark a shopping item as bought (fuzzy match by name)
 *
 * Body: { text: string }
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../../_auth'

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { text?: string }
  const text = body.text?.trim()
  if (!text) return NextResponse.json({ error: 'חסר טקסט' }, { status: 400 })

  const admin = createAdminClient()

  const { data: items } = await admin
    .from('shopping_items')
    .select('id, text')
    .eq('household_id', auth.householdId)
    .eq('done', false)
    .ilike('text', `%${text}%`)
    .limit(5)

  if (!items?.length) {
    return NextResponse.json({ error: 'item_not_found', searched: text }, { status: 404 })
  }

  // Pick the closest match (shortest title = most specific)
  const item = items.sort((a, b) => a.text.length - b.text.length)[0]

  const { error } = await admin
    .from('shopping_items')
    .update({ done: true })
    .eq('id', item.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[bot/shopping/done] marked "${item.text}" household=${auth.householdId}`)
  return NextResponse.json({ ok: true, item: item.text })
}
