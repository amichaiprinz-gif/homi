/**
 * POST /api/shopping/build-session
 *
 * Creates a new cart-build session. Stores the item list server-side
 * so the static bookmarklet can fetch it by UUID — no item data in the URL.
 *
 * Returns: { sessionId, rlUrl }
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 10

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: memberRow } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const householdId = memberRow?.household_id ?? null

  const body = await req.json().catch(() => ({})) as {
    items?: { text: string; quantity: string | null }[]
  }
  const items = (body.items ?? []).filter(i => i.text?.trim())

  if (!items.length) {
    return NextResponse.json({ error: 'רשימה ריקה' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: session, error } = await admin
    .from('rl_build_sessions')
    .insert({
      user_id: user.id,
      household_id: householdId,
      raw_items: items,
      status: 'init',
    })
    .select('id')
    .single()

  if (error || !session) {
    console.error('[build-session] insert error:', error?.message)
    return NextResponse.json({ error: 'שגיאת יצירת סשן' }, { status: 500 })
  }

  const rlUrl = `https://www.rami-levy.co.il/he/online#hb_session=${session.id}`
  console.log(`[build-session] created id=${session.id} items=${items.length} user=${user.id}`)

  return NextResponse.json({ sessionId: session.id, rlUrl })
}
