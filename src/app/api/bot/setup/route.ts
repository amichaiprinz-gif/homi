/**
 * GET /api/bot/setup
 *
 * Browser-only route (requires Supabase session cookie).
 * Returns the user's household_id so they can configure OpenClaw.
 * Open this URL in the browser while logged in to HomeBase.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'התחבר ל-HomeBase קודם' }, { status: 401 })

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    user_id: user.id,
    household_id: member?.household_id ?? null,
    instructions: 'העתק את household_id לתוך HOMEBASE_HOUSEHOLD_ID ב-OpenClaw',
  })
}
