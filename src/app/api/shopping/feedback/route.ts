/**
 * POST /api/shopping/feedback
 *
 * CORS-enabled — called by the Chrome extension after the user confirms the cart.
 * Records which product was kept (good) or removed (bad) for each shopping item,
 * so future AI matching can prioritise the user's previously accepted products.
 *
 * Body: {
 *   sid: string                                          — build-session UUID
 *   kept:    { itemText, rlProductId, rlProductName }[]  — items user kept
 *   removed: { itemText, rlProductId, rlProductName }[]  — items user X'd out
 * }
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 10

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.rami-levy.co.il',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

interface FeedbackItem {
  itemText: string
  rlProductId: number
  rlProductName: string | null
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as {
    sid?: string
    kept?: FeedbackItem[]
    removed?: FeedbackItem[]
  }

  const { sid, kept = [], removed = [] } = body

  // Nothing to save
  if (!sid || (!kept.length && !removed.length)) {
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  }

  const admin = createAdminClient()

  // Resolve household_id via the session
  const { data: session } = await admin
    .from('rl_build_sessions')
    .select('household_id')
    .eq('id', sid)
    .maybeSingle()

  if (!session?.household_id) {
    // No household means solo user — skip silently
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  }

  const householdId = session.household_id
  const now = new Date().toISOString()

  const rows = [
    ...kept.map(x => ({
      household_id:   householdId,
      item_text:      x.itemText,
      rl_product_id:  x.rlProductId,
      rl_product_name: x.rlProductName ?? null,
      feedback:       'good',
      updated_at:     now,
    })),
    ...removed.map(x => ({
      household_id:   householdId,
      item_text:      x.itemText,
      rl_product_id:  x.rlProductId,
      rl_product_name: x.rlProductName ?? null,
      feedback:       'bad',
      updated_at:     now,
    })),
  ]

  const { error } = await admin
    .from('rl_product_preferences')
    .upsert(rows, { onConflict: 'household_id,item_text,rl_product_id' })

  if (error) {
    console.error('[feedback] upsert error:', error.message)
    // Don't fail — cart was already added
  } else {
    console.log(`[feedback] saved ${kept.length} good + ${removed.length} bad for household=${householdId}`)
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
}
