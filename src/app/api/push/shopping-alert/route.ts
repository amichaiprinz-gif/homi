import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import webpush from 'web-push'
import { generateAiPushMessage } from '@/lib/ai-push'

export async function POST() {
  // ── VAPID setup ──────────────────────────────────────────────────────────────
  const vapidSubject = process.env.VAPID_SUBJECT
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    console.error('PUSH_ERROR: One or more VAPID env vars are missing (VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)')
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  console.log('PUSH_DEBUG: VAPID configured, subject:', vapidSubject)

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  console.log('PUSH_DEBUG: Shopping alert triggered by user_id:', user.id)

  // ── Household lookup ──────────────────────────────────────────────────────────
  const { data: memberRow } = await supabase
    .from('household_members')
    .select('household_id, display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!memberRow?.household_id) {
    console.error('PUSH_ERROR: No household found for user_id:', user.id)
    return NextResponse.json({ error: 'No household' }, { status: 400 })
  }
  console.log('PUSH_DEBUG: Household ID:', memberRow.household_id, '| Shopper:', memberRow.display_name)

  // ── All household members (including shopper — confirms push works for them too) ──
  const { data: allMembers } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', memberRow.household_id)

  if (!allMembers?.length) {
    console.log('PUSH_DEBUG: No members in household — nothing to send')
    return NextResponse.json({ sent: 0, debug: 'no_members' })
  }

  const otherIds = allMembers.map(m => m.user_id)
  console.log('PUSH_DEBUG: Target user_ids:', otherIds.join(', '))

  // ── Pre-flight: confirm tokens exist before doing any AI work ─────────────────
  // Must use admin client — RLS on push_subscriptions only allows users to read
  // their own row (user_id = auth.uid()). Reading other household members'
  // subscriptions requires bypassing RLS with the service role key.
  const admin = createAdminClient()
  const { data: subsData, error: subsError } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, subscription')
    .in('user_id', otherIds)

  if (subsError) {
    console.error('PUSH_ERROR: DB error querying push_subscriptions:', subsError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (!subsData?.length) {
    console.error(`PUSH_ERROR: No tokens found in DB for household ${memberRow.household_id}. Looked for user_ids: [${otherIds.join(', ')}]`)
    return NextResponse.json({ sent: 0, debug: 'no_tokens' })
  }

  console.log(`Push Attempt: Sending to ${subsData.length} device(s)`)

  // ── AI message generation — isolated so failure never blocks sending ───────────
  let aiBody: string
  try {
    aiBody = await generateAiPushMessage('shopping', { shopperName: memberRow.display_name })
  } catch {
    aiBody = `🛒 ${memberRow.display_name} בסופר — שלחו בקשות עכשיו`
    console.warn('PUSH_DEBUG: AI generation failed, using hardcoded fallback')
  }

  // ── Send to each device ────────────────────────────────────────────────────────
  let sent = 0
  for (const sub of subsData) {
    try {
      await webpush.sendNotification(
        sub.subscription as webpush.PushSubscription,
        JSON.stringify({
          title: `🛒 ${memberRow.display_name} בסופר!`,
          body: aiBody,
          url: '/shopping',
        })
      )
      sent++
      console.log(`Push Success: Device for user_id ${sub.user_id} received the message`)
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
      console.error(`Push Failed: Error for user_id ${sub.user_id} HTTP=${code ?? 'unknown'}: ${String(err)}`)
      // Only remove if the push service says the subscription is permanently gone (404/410).
      // Do NOT delete on transient errors (5xx, network timeout) — that would silently
      // remove valid subscriptions whenever the push server has a hiccup.
      if (code === 404 || code === 410) {
        await admin.from('push_subscriptions').delete()
          .eq('user_id', sub.user_id).eq('endpoint', sub.endpoint ?? '')
        console.log(`PUSH_DEBUG: Removed stale subscription for user_id ${sub.user_id} (HTTP ${code})`)
      }
    }
  }

  console.log(`PUSH_DEBUG: Done — sent ${sent} of ${subsData.length}`)
  return NextResponse.json({ sent })
}
