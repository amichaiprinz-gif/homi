/**
 * GET  /api/bot/budget/limit   — return current monthly budget limit (from bot_memory key "budget_limit")
 * POST /api/bot/budget/limit   — set monthly budget limit { amount: number }
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../../_auth'

const KEY = 'budget_limit'

export async function GET(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('bot_memory')
    .select('value')
    .eq('household_id', auth.householdId)
    .eq('key', KEY)
    .maybeSingle()

  const limit = data?.value ? Number(data.value) : null
  return NextResponse.json({ limit })
}

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { amount?: number | string }
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })

  const admin = createAdminClient()
  await admin
    .from('bot_memory')
    .upsert(
      { household_id: auth.householdId, key: KEY, value: String(Math.round(amount)), updated_at: new Date().toISOString() },
      { onConflict: 'household_id,key' }
    )

  return NextResponse.json({ ok: true, limit: Math.round(amount) })
}
