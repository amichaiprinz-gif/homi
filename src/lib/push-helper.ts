/**
 * push-helper.ts
 *
 * Reusable push-notification utilities.
 * All functions assume webpush.setVapidDetails() has already been called by the
 * route handler before invocation.
 *
 * Multi-device design: push_subscriptions has one row per (user_id, endpoint),
 * so each user can have N devices. Helpers send to ALL registered devices and
 * automatically prune 404/410 (expired) rows.
 */
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

type PushPayload = { title: string; body: string; url: string }

/**
 * Send a push notification to every registered device for a single user.
 * Returns counts of successfully sent and removed (expired) subscriptions.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, subscription')
    .eq('user_id', userId)

  if (!subs?.length) return { sent: 0, removed: 0 }

  let sent = 0
  let removed = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        sub.subscription as webpush.PushSubscription,
        JSON.stringify(payload),
      )
      sent++
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        await admin
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', sub.endpoint)
        removed++
      }
    }
  }
  return { sent, removed }
}

/**
 * Send a push notification to every registered device across a list of users.
 * Returns aggregate sent/removed counts.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  if (!userIds.length) return { sent: 0, removed: 0 }

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, subscription')
    .in('user_id', userIds)

  if (!subs?.length) return { sent: 0, removed: 0 }

  let sent = 0
  let removed = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        sub.subscription as webpush.PushSubscription,
        JSON.stringify(payload),
      )
      sent++
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        await admin
          .from('push_subscriptions')
          .delete()
          .eq('user_id', sub.user_id)
          .eq('endpoint', sub.endpoint)
        removed++
      }
    }
  }
  return { sent, removed }
}
