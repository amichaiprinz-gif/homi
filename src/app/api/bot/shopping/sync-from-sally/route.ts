/**
 * POST /api/bot/shopping/sync-from-sally
 *
 * Accepts Sally's raw shopping list text (however she formats it) and
 * intelligently parses it into items, then upserts them into HomeBase.
 *
 * Body: { text: string }
 *   text — Sally's raw response, e.g. "1. חלב\n2. לחם\n3. ביצים"
 *         or "✅ חלב\n❌ לחם\n* ביצים" etc.
 *
 * The parser strips list markers, bullets, checkboxes, numbers, and blank lines.
 * Returns: { synced: number, skipped: number, items: string[] }
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../../_auth'

/** Extract shopping items from Sally's free-form response text */
function parseSallyList(raw: string): string[] {
  return raw
    .split(/[\n,،]+/)
    .map(line =>
      line
        // Strip list markers: numbers, bullets, checkmarks, emoji, dashes
        .replace(/^[\s\d\.\-\*•✅❌☑️🛒🛍️]+/, '')
        // Strip trailing punctuation
        .replace(/[.,;:]+$/, '')
        .trim()
    )
    .filter(line => line.length >= 2 && line.length <= 80)
}

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { text?: string }
  const text = body.text?.trim()
  if (!text) return NextResponse.json({ error: 'חסר text' }, { status: 400 })

  const parsed = parseSallyList(text)
  if (!parsed.length) return NextResponse.json({ synced: 0, skipped: 0, items: [] })

  const admin = createAdminClient()

  // Get existing undone items to deduplicate
  const { data: existing } = await admin
    .from('shopping_items')
    .select('text')
    .eq('household_id', auth.householdId)
    .eq('done', false)

  const existingLower = new Set((existing ?? []).map(e => e.text.trim().toLowerCase()))
  const newItems = parsed.filter(t => !existingLower.has(t.toLowerCase()))
  const skipped = parsed.length - newItems.length

  if (newItems.length) {
    await admin.from('shopping_items').insert(
      newItems.map(text => ({ text, household_id: auth.householdId, done: false }))
    )
  }

  console.log(`[bot/shopping/sync-from-sally] parsed=${parsed.length} synced=${newItems.length} skipped=${skipped} household=${auth.householdId}`)
  return NextResponse.json({ synced: newItems.length, skipped, items: newItems })
}
