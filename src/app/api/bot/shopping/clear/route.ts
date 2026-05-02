/**
 * POST /api/bot/shopping/clear
 *
 * Delete all items that are marked as done (bought) from the shopping list.
 * Called by Bob after a shopping trip: "סיימנו לקנות, נקה את הרשימה".
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../../_auth'

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { error, count } = await admin
    .from('shopping_items')
    .delete({ count: 'exact' })
    .eq('household_id', auth.householdId)
    .eq('done', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: count ?? 0 })
}
