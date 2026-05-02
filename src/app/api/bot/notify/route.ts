/**
 * POST /api/bot/notify — Bob sends a push notification to all household devices
 *
 * Body: { message: string }
 * Auth: Authorization: Bearer <BOT_TOKEN>
 *
 * Use this when Bob performs an action the user should know about:
 * adding shopping items, completing a task, or any other notable event.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../_auth'
import webpush from 'web-push'

function isExpiredSubscription(err: unknown): boolean {
  const code = (err as { statusCode?: number })?.statusCode
  return code === 404 || code === 410
}

export const maxDuration = 15

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { message?: string }
  const message = body.message?.trim()
  if (!message) return NextResponse.json({ error: 'חסר הודעה' }, { status: 400 })

  const vapidOk = process.env.VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  if (!vapidOk) return NextResponse.json({ error: 'Push not configured' }, { status: 500 })

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const admin = createAdminClient()

  // Get all push subscriptions for this household
  const { data: members } = await admin
    .from('household_members')
    .select('user_id')
    .eq('household_id', auth.householdId)

  if (!members?.length) return NextResponse.json({ sent: 0 })

  const userIds = members.map(m => m.user_id)
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, subscription')
    .in('user_id', userIds)

  if (!subs?.length) return NextResponse.json({ sent: 0, message: 'אין מנויים' })

  let sent = 0
  let failed = 0

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        sub.subscription as webpush.PushSubscription,
        JSON.stringify({ title: 'בוב 🤖', body: message, url: '/dashboard' })
      )
      sent++
    } catch (err) {
      if (isExpiredSubscription(err)) {
        await admin.from('push_subscriptions').delete()
          .eq('user_id', sub.user_id).eq('endpoint', sub.endpoint ?? '')
      } else {
        failed++
      }
    }
  }

  console.log(`[bot/notify] sent=${sent} failed=${failed} household=${auth.householdId}`)
  return NextResponse.json({ sent, failed })
}
