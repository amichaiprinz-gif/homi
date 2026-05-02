/**
 * GET  /api/shopping/rl-auth — check connection status for this household
 * POST /api/shopping/rl-auth — connect with RL credentials (email + password)
 * DELETE /api/shopping/rl-auth — disconnect (remove stored session)
 *
 * The session cookie is stored in `rl_sessions` via admin client only.
 * Clients never see the raw cookie; GET returns only { connected, rlEmail }.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loginToRL } from '@/lib/supermarket/rl-auth'

export const maxDuration = 30

async function resolveHousehold(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.household_id ?? null
}

// ── GET — connection status ───────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await resolveHousehold(user.id)
  if (!householdId) return NextResponse.json({ connected: false, rlEmail: null })

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('rl_sessions')
    .select('rl_email, status, connected_at')
    .eq('household_id', householdId)
    .maybeSingle()

  if (!session) return NextResponse.json({ connected: false, rlEmail: null })

  return NextResponse.json({
    connected: session.status === 'active',
    rlEmail: session.rl_email,
    connectedAt: session.connected_at,
  })
}

// ── POST — connect ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await resolveHousehold(user.id)
  if (!householdId) {
    return NextResponse.json({ error: 'יש ליצור בית תחילה' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as { email?: string; password?: string }
  const { email, password } = body

  if (!email?.trim() || !password) {
    return NextResponse.json({ error: 'יש להזין אימייל וסיסמה' }, { status: 400 })
  }

  const loginResult = await loginToRL(email.trim(), password)

  if (!loginResult.success || !loginResult.sessionCookie) {
    return NextResponse.json({ error: loginResult.error ?? 'כניסה נכשלה' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: upsertErr } = await admin
    .from('rl_sessions')
    .upsert({
      household_id: householdId,
      user_id: user.id,
      rl_email: loginResult.rlEmail!,
      session_cookie: loginResult.sessionCookie,
      status: 'active',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'household_id' })

  if (upsertErr) {
    console.error('[rl-auth] upsert error:', upsertErr.message)
    return NextResponse.json({ error: 'שגיאת שמירה' }, { status: 500 })
  }

  console.log(`[rl-auth] connected user=${user.id} household=${householdId} email=${email}`)
  return NextResponse.json({ success: true, rlEmail: loginResult.rlEmail })
}

// ── DELETE — disconnect ───────────────────────────────────────────────────────

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await resolveHousehold(user.id)
  if (!householdId) return NextResponse.json({ success: true })

  const admin = createAdminClient()
  await admin.from('rl_sessions').delete().eq('household_id', householdId)

  console.log(`[rl-auth] disconnected user=${user.id} household=${householdId}`)
  return NextResponse.json({ success: true })
}
