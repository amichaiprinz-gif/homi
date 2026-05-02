/**
 * POST /api/shopping/execute-cart
 *
 * Executes a pre-built cart: adds matched products to the household's
 * Rami Levy account using the stored session cookie.
 *
 * Body: { items: CartItem[] }
 * Returns: { added, failed, cartUrl, errors, sessionExpired? }
 *
 * Only items with status !== 'not_found' and a valid rlProductId are sent.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addItemsToRLCart } from '@/lib/supermarket/rl-auth'
import type { CartItem } from '@/lib/supermarket/rl-cart'

export const maxDuration = 60

function parseQty(qty: string | null): number {
  if (!qty) return 1
  const n = parseFloat(qty)
  return isNaN(n) || n <= 0 ? 1 : Math.ceil(n)
}

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
  if (!householdId) {
    return NextResponse.json({ error: 'אין בית מחובר' }, { status: 400 })
  }

  // Fetch the stored RL session — admin-only (no user RLS on this table)
  const admin = createAdminClient()
  const { data: rlSession } = await admin
    .from('rl_sessions')
    .select('session_cookie, rl_email, status')
    .eq('household_id', householdId)
    .maybeSingle()

  if (!rlSession) {
    return NextResponse.json(
      { error: 'לא מחובר לרמי לוי — חבר חשבון בהגדרות', sessionExpired: false },
      { status: 400 },
    )
  }

  if (rlSession.status === 'expired') {
    return NextResponse.json(
      { error: 'חיבור רמי לוי פג תוקף — התחבר מחדש בהגדרות', sessionExpired: true },
      { status: 400 },
    )
  }

  // Parse request body
  const body = await req.json().catch(() => ({})) as { items?: CartItem[] }
  const items = body.items ?? []

  const actionable = items.filter(i => i.status !== 'not_found' && i.rlProductId != null)
  if (actionable.length === 0) {
    return NextResponse.json({ error: 'אין מוצרים להוסיף לסל' }, { status: 400 })
  }

  const cartItems = actionable.map(i => ({
    rlProductId: i.rlProductId!,
    quantity: parseQty(i.quantity),
  }))

  console.log(`[execute-cart] START user=${user.id} household=${householdId} items=${cartItems.length} email=${rlSession.rl_email}`)

  const result = await addItemsToRLCart(rlSession.session_cookie, cartItems)

  console.log(`[execute-cart] DONE added=${result.added} failed=${result.failed}`)

  // If RL reported session expired, mark it in the DB so Settings shows reconnect prompt
  const sessionExpired = result.errors.includes('session_expired')
  if (sessionExpired) {
    await admin
      .from('rl_sessions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('household_id', householdId)
    console.log(`[execute-cart] session_expired — marked household=${householdId}`)
  }

  return NextResponse.json({ ...result, sessionExpired })
}
