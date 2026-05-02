/**
 * POST /api/auth/forgot-password
 *
 * Sends a password-reset email from the server using flowType: 'implicit'.
 * Browser-side resetPasswordForEmail() uses PKCE by default, which breaks
 * when the email link is opened in a different browser/webview (e.g. Gmail
 * on Android). Calling it server-side with implicit flow sends a hash-based
 * token instead, which works cross-browser.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { email?: string }
  const email = body.email?.trim()

  if (!email) {
    return NextResponse.json({ error: 'נדרש אימייל' }, { status: 400 })
  }

  // Server-side client with implicit flow — no PKCE challenge is sent,
  // so Supabase issues a hash-based recovery token in the email link.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, flowType: 'implicit' } },
  )

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
  })

  if (error) {
    console.error('[forgot-password]', error.message)
  }

  // Always 200 — don't leak whether the email exists
  return NextResponse.json({ ok: true })
}
