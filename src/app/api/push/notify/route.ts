import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import webpush from 'web-push'
import { generateAiPushMessage } from '@/lib/ai-push'

// Returns true only when the push provider says the subscription is permanently gone.
// HTTP 404/410 = invalid subscription — safe to delete.
// Anything else (network error, 429, 5xx) = transient — keep the subscription.
function isExpiredSubscription(err: unknown): boolean {
  const code = (err as { statusCode?: number })?.statusCode
  return code === 404 || code === 410
}

// Called on dashboard load — sends push reminders for assigned tasks due soon.
//
// Rate-limit: at most one notification per user per hour, tracked via last_sent_at.
//
// IMPORTANT: updated_at is NOT used for rate limiting. It only records when the
// subscription token was last saved. A fresh registration (last_sent_at = NULL)
// is treated as "never notified" and is NOT throttled — the user gets their first
// reminder on the very next dashboard visit or cron run.
export async function POST() {
  if (process.env.VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: memberRows } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const member = memberRows?.[0] ?? null
  if (!member) return NextResponse.json({ sent: 0 })

  const { data: assignedTasks } = await supabase
    .from('tasks')
    .select('id, title, assigned_to, notify_before_hours, next_due_at')
    .eq('household_id', member.household_id)
    .not('assigned_to', 'is', null)
    .not('next_due_at', 'is', null)
    .neq('is_quick', true)

  if (!assignedTasks?.length) {
    console.log('PUSH [notify]: no assigned tasks with due dates')
    return NextResponse.json({ sent: 0 })
  }

  const now = new Date()

  // Group tasks within their per-task notify_before_hours window by assigned user
  const byUser = new Map<string, string[]>()
  for (const t of assignedTasks) {
    if (!t.assigned_to || !t.next_due_at) continue
    const dueMs = new Date(t.next_due_at).getTime() - now.getTime()
    const windowMs = (t.notify_before_hours ?? 1) * 3_600_000
    // Include: within window (upcoming) or overdue up to 24h
    if (dueMs <= windowMs && dueMs > -86_400_000) {
      const arr = byUser.get(t.assigned_to) ?? []
      arr.push(t.title)
      byUser.set(t.assigned_to, arr)
    }
  }

  if (!byUser.size) {
    console.log('PUSH [notify]: no tasks within notification windows')
    return NextResponse.json({ sent: 0 })
  }

  console.log(`PUSH [notify]: ${byUser.size} user(s) have tasks due soon`)
  let sent = 0
  let throttled = 0

  for (const [userId, titles] of byUser) {
    const { data: userSubs } = await supabase
      .from('push_subscriptions')
      .select('subscription, last_sent_at')
      .eq('user_id', userId)

    if (!userSubs?.length) {
      console.log(`PUSH [notify]: no subscription for user ${userId}`)
      continue
    }

    // Rate-limit: throttle the whole user based on their most-recently-notified device.
    // NULL last_sent_at = never notified = no throttle (covers first-time subscribers).
    const mostRecent = userSubs.reduce((latest, s) => {
      if (!s.last_sent_at) return latest
      if (!latest) return s.last_sent_at
      return s.last_sent_at > latest ? s.last_sent_at : latest
    }, null as string | null)
    if (mostRecent) {
      const msSinceLast = now.getTime() - new Date(mostRecent).getTime()
      if (msSinceLast < 3_600_000) {
        console.log(`PUSH [notify]: throttled user ${userId} — last sent ${Math.round(msSinceLast / 60000)}m ago`)
        throttled++
        continue
      }
    }

    let body: string
    try {
      body = await generateAiPushMessage('task_reminder', { titles })
    } catch {
      body = titles.length === 1 ? `⏰ ${titles[0]} מחכה לך` : `📋 ${titles.length} משימות מחכות לך`
    }

    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          sub.subscription as webpush.PushSubscription,
          JSON.stringify({ title: 'HomeBase 🏠', body, url: '/dashboard' })
        )
        await supabase
          .from('push_subscriptions')
          .update({ last_sent_at: now.toISOString() })
          .eq('user_id', userId)
          .eq('endpoint', (sub.subscription as webpush.PushSubscription).endpoint)
        sent++
        console.log(`PUSH [notify]: sent to user ${userId} (${titles.length} task(s): ${titles.join(', ')})`)
      } catch (err) {
        if (isExpiredSubscription(err)) {
          const code = (err as { statusCode?: number })?.statusCode
          const endpoint = (sub.subscription as webpush.PushSubscription).endpoint
          console.log(`PUSH [notify]: subscription expired for user ${userId} endpoint=${endpoint.substring(0, 40)}... (HTTP ${code}) — removing only this device`)
          // Delete ONLY the specific expired subscription, not all devices for this user
          await supabase.from('push_subscriptions').delete()
            .eq('user_id', userId)
            .eq('endpoint', endpoint)
        } else {
          console.error(`PUSH [notify]: transient send failure for user ${userId}:`, String(err))
        }
      }
    }
  }

  console.log(`PUSH [notify]: done — sent=${sent} throttled=${throttled}`)
  return NextResponse.json({ sent, throttled })
}
