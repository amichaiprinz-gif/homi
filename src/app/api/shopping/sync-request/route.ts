/**
 * POST /api/shopping/sync-request
 *
 * Sets a flag in bot_flags so the Bob polling cron knows to ask Sally
 * for her shopping list. Called by the "אני בסופר" button in the app.
 *
 * Uses user session auth (not bot token) so the browser can call it directly.
 * The bob cron (sally-sync-poll, every 5min) reads this flag via
 *   GET /api/bot/sync-sally  →  if pending=true, asks Sally and syncs.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const householdId = member?.household_id
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 400 })

  const admin = createAdminClient()
  await admin.from('bot_flags').upsert(
    { key: 'sync_sally', household_id: householdId, created_at: new Date().toISOString() },
    { onConflict: 'key,household_id' }
  )

  return NextResponse.json({ ok: true })
}
