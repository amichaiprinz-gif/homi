import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import webpush from 'web-push'

// POST /api/push/test
// Sends a real test notification to the currently logged-in user.
// Use this to verify the full pipeline (VAPID → DB → push service → device) works.
// Returns diagnostic info regardless of success or failure.
export async function POST() {
  const diag: Record<string, unknown> = {}

  // ── VAPID ──────────────────────────────────────────────────────────────────
  const vapidSubject = process.env.VAPID_SUBJECT
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

  diag.vapid_subject_set = Boolean(vapidSubject)
  diag.vapid_public_key_set = Boolean(vapidPublicKey)
  diag.vapid_private_key_set = Boolean(vapidPrivateKey)
  diag.vapid_public_key_prefix = vapidPublicKey?.substring(0, 12) ?? null

  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ ok: false, error: 'VAPID env vars missing', diag }, { status: 500 })
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    diag.vapid_init = 'ok'
  } catch (err) {
    diag.vapid_init = 'failed: ' + String(err)
    return NextResponse.json({ ok: false, error: 'VAPID init failed', diag }, { status: 500 })
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not logged in', diag }, { status: 401 })
  diag.user_id = user.id

  // ── Subscription — most recently registered device ────────────────────────
  // With multi-device support, a user may have multiple rows; pick the latest.
  const { data: sub, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('subscription, updated_at, last_sent_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  diag.subscription_found = Boolean(sub?.subscription)
  diag.subscription_updated_at = sub?.updated_at ?? null
  diag.subscription_last_sent_at = sub?.last_sent_at ?? null
  diag.subscription_db_error = subErr?.message ?? null

  if (!sub?.subscription) {
    return NextResponse.json({
      ok: false,
      error: 'No push subscription in DB for this user. Register via the Shopping page banner.',
      diag,
    }, { status: 400 })
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  const payload = JSON.stringify({
    title: 'HomeBase 🏠 — Test',
    body: 'הודעת בדיקה! אם ראית את זה, ה-Push עובד 🎉',
    url: '/dashboard',
  })

  try {
    await webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload)
    await supabase
      .from('push_subscriptions')
      .update({ last_sent_at: new Date().toISOString() })
      .eq('user_id', user.id)
    diag.send_result = 'success'
    console.log(`PUSH [test]: SUCCESS for user ${user.id}`)
    return NextResponse.json({ ok: true, diag })
  } catch (err) {
    const code = (err as { statusCode?: number })?.statusCode
    diag.send_result = 'failed'
    diag.send_error = String(err)
    diag.send_status_code = code ?? null
    console.error(`PUSH [test]: FAILED for user ${user.id}:`, String(err))

    if (code === 404 || code === 410) {
      await supabase.from('push_subscriptions').delete()
        .eq('user_id', user.id)
      diag.subscription_removed = true
      return NextResponse.json({
        ok: false,
        error: `Subscription is expired (HTTP ${code}). Re-register via the Shopping page banner.`,
        diag,
      }, { status: 400 })
    }

    return NextResponse.json({ ok: false, error: 'Send failed — see diag', diag }, { status: 500 })
  }
}
