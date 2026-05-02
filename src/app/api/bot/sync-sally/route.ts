/**
 * GET  /api/bot/sync-sally  — Bob polls this every minute.
 *                             Returns { pending: true } once, then clears the flag.
 * POST /api/bot/sync-sally  — Called by the "אני בסופר" button to request a Sally sync.
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../_auth'

export async function GET(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('bot_flags')
    .select('key')
    .eq('key', 'sync_sally')
    .eq('household_id', auth.householdId)
    .maybeSingle()

  if (!data) return NextResponse.json({ pending: false })

  // Clear the flag — Bob will handle it exactly once
  await admin.from('bot_flags').delete().eq('key', 'sync_sally').eq('household_id', auth.householdId)

  return NextResponse.json({ pending: true })
}

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  await admin.from('bot_flags').upsert(
    { key: 'sync_sally', household_id: auth.householdId, created_at: new Date().toISOString() },
    { onConflict: 'key,household_id' }
  )

  return NextResponse.json({ ok: true })
}
