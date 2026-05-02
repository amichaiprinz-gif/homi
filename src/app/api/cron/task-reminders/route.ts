import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import webpush from 'web-push'
import { generateAiPushMessage } from '@/lib/ai-push'

// Returns true only when the push provider says the subscription is permanently gone.
function isExpiredSubscription(err: unknown): boolean {
  const code = (err as { statusCode?: number })?.statusCode
  return code === 404 || code === 410
}

// Vercel cron — runs every hour: "0 * * * *"
//
// This is the main per-task reminder dispatcher.
// Unlike daily-push (which sends broad morning/evening summaries), this route
// reads each task's notify_before_hours field and fires a notification when a
// task enters its individual notification window.
//
// Rate-limit: users are notified at most once every 2 hours via last_sent_at.
// NULL last_sent_at = never notified = NOT throttled (new subscribers get reminded immediately).
//
// Authenticated via Authorization: Bearer <CRON_SECRET>.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const vapidOk = process.env.VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  if (!vapidOk) {
    console.error('PUSH [task-reminders]: VAPID env vars missing — aborting')
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 })
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const supabase = createAdminClient()
  const now = new Date()

  // Fetch tasks that have a due date.
  // Look-ahead: up to 24h (per-task window filters below).
  // Overdue lookback: 7 days — so tasks that have been overdue for days are still caught.
  // notify_before_hours defaults to 1 if null.
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, title, household_id, assigned_to, next_due_at, notify_before_hours')
    .not('next_due_at', 'is', null)
    .gte('next_due_at', new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString()) // overdue up to 7 days
    .lte('next_due_at', new Date(now.getTime() + 24 * 3_600_000).toISOString()) // due within 24h

  if (tasksError) {
    console.error('PUSH [task-reminders]: task query error:', tasksError.message)
    return NextResponse.json({ error: tasksError.message }, { status: 500 })
  }

  console.log(`PUSH [task-reminders]: ${tasks?.length ?? 0} candidate task(s) in window`)
  if (!tasks?.length) return NextResponse.json({ sent: 0, throttled: 0 })

  // Filter to tasks that are actually within their own notify_before_hours window right now
  const dueTasks = tasks.filter(t => {
    if (!t.next_due_at) return false
    const dueMs = new Date(t.next_due_at).getTime() - now.getTime()
    const windowMs = (t.notify_before_hours ?? 1) * 3_600_000
    // Within window (upcoming) or overdue up to 7 days
    return dueMs <= windowMs && dueMs > -7 * 24 * 3_600_000
  })

  console.log(`PUSH [task-reminders]: ${dueTasks.length} task(s) within their notification window`)
  if (!dueTasks.length) return NextResponse.json({ sent: 0, throttled: 0 })

  // Group by target user: assigned tasks → their assigned user; unassigned → all household members
  // We need household members for unassigned tasks
  const byUser = new Map<string, string[]>()

  // Collect household IDs that have unassigned due tasks
  const unassignedHouseholdIds = [...new Set(
    dueTasks.filter(t => !t.assigned_to && t.household_id).map(t => t.household_id!)
  )]

  // Build a map of household_id → [user_ids] for unassigned task fanout
  const householdMembers = new Map<string, string[]>()
  if (unassignedHouseholdIds.length) {
    const { data: members } = await supabase
      .from('household_members')
      .select('household_id, user_id')
      .in('household_id', unassignedHouseholdIds)
    for (const m of members ?? []) {
      const arr = householdMembers.get(m.household_id) ?? []
      arr.push(m.user_id)
      householdMembers.set(m.household_id, arr)
    }
  }

  for (const t of dueTasks) {
    const targets = t.assigned_to
      ? [t.assigned_to]
      : (householdMembers.get(t.household_id ?? '') ?? [])

    for (const uid of targets) {
      const arr = byUser.get(uid) ?? []
      arr.push(t.title)
      byUser.set(uid, arr)
    }
  }

  console.log(`PUSH [task-reminders]: ${byUser.size} user(s) to notify`)
  if (!byUser.size) return NextResponse.json({ sent: 0, throttled: 0 })

  // Fetch all subscriptions for these users in one query (multiple rows per user = multi-device)
  const allUserIds = [...byUser.keys()]
  const { data: allSubs } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, subscription, last_sent_at')
    .in('user_id', allUserIds)

  // Group by user — each user may have multiple device subscriptions
  const subsByUser = new Map<string, typeof allSubs>()
  for (const sub of allSubs ?? []) {
    const arr = subsByUser.get(sub.user_id) ?? []
    arr.push(sub)
    subsByUser.set(sub.user_id, arr)
  }
  console.log(`PUSH [task-reminders]: ${subsByUser.size} user(s) with subscriptions out of ${allUserIds.length} targets`)

  let sent = 0
  let throttled = 0
  let failed = 0
  let removed = 0

  for (const [userId, titles] of byUser) {
    const userSubs = subsByUser.get(userId)
    if (!userSubs?.length) {
      console.log(`PUSH [task-reminders]: no subscription for user ${userId}`)
      continue
    }

    // Rate-limit: throttle per user based on most recent any-device notification.
    // NULL last_sent_at = never sent = always proceed (new subscribers get first reminder immediately).
    const mostRecent = userSubs.reduce((latest, s) => {
      if (!s.last_sent_at) return latest
      if (!latest) return s.last_sent_at
      return s.last_sent_at > latest ? s.last_sent_at : latest
    }, null as string | null)
    if (mostRecent) {
      const msSinceLast = now.getTime() - new Date(mostRecent).getTime()
      if (msSinceLast < 2 * 3_600_000) {
        console.log(`PUSH [task-reminders]: throttled user ${userId} — last sent ${Math.round(msSinceLast / 60000)}m ago`)
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
          .eq('endpoint', sub.endpoint ?? '')
        sent++
        console.log(`Push Success: user ${userId} (${titles.length} task(s): ${titles.slice(0, 3).join(', ')})`)
      } catch (err) {
        if (isExpiredSubscription(err)) {
          const code = (err as { statusCode?: number })?.statusCode
          console.log(`Push Failed: user ${userId} subscription expired (HTTP ${code}) — removing`)
          await supabase.from('push_subscriptions').delete()
            .eq('user_id', userId).eq('endpoint', sub.endpoint ?? '')
          removed++
        } else {
          console.error(`Push Failed: user ${userId} transient error — keeping subscription:`, String(err))
          failed++
        }
      }
    }
  }

  console.log(`PUSH [task-reminders]: done — sent=${sent} throttled=${throttled} failed=${failed} removed=${removed}`)
  return NextResponse.json({ sent, throttled, failed, removed })
}
