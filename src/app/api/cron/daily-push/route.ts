import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import webpush from 'web-push'
import { generateAiPushMessage } from '@/lib/ai-push'

// Returns true only when the push provider says the subscription is permanently gone.
function isExpiredSubscription(err: unknown): boolean {
  const code = (err as { statusCode?: number })?.statusCode
  return code === 404 || code === 410
}

// Vercel cron — runs TWICE DAILY (Hobby-compatible, each schedule fires once per day):
//   Morning: "0 5 * * *"  UTC = 07:00 IST (winter, UTC+2) / 08:00 IDT (summer, UTC+3)
//   Evening: "0 15 * * *" UTC = 17:00 IST (winter, UTC+2) / 18:00 IDT (summer, UTC+3)
//
// Both UTC times land inside acceptable send windows in both Israel winter and summer.
// DST shifts the local delivery time by ±1h relative to the target, which is acceptable.
// Intl.DateTimeFormat with timeZone:'Asia/Jerusalem' still derives the correct context
// (morning vs evening) regardless of DST offset at execution time.
//
// A 6-hour last_sent_at throttle guards against duplicate sends on manual retries.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()

  // ── Derive Israel local time for logging and context ────────────────────
  // Intl resolves 'Asia/Jerusalem' to UTC+2 (IST) or UTC+3 (IDT) automatically.
  const israelHour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      hour: 'numeric',
      hour12: false,
    }).format(now),
    10
  )
  const israelTimeStr = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)

  // Cron fires at 05:00 UTC (morning) or 15:00 UTC (evening).
  // israel_hour < 13 cleanly separates the two scheduled runs.
  const context: 'morning' | 'evening' = israelHour < 13 ? 'morning' : 'evening'

  console.log(`CRON_DAILY_PUSH_STARTED run_at_utc=${now.toISOString()} run_at_israel=${israelTimeStr} israel_hour=${israelHour} context=${context}`)

  const vapidOk = process.env.VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  if (!vapidOk) {
    console.error('CRON_DAILY_PUSH_STARTED skip_reason="VAPID env vars missing"')
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 })
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const supabase = createAdminClient()

  // Both runs look 48h ahead so tasks due "tomorrow" are never missed.
  // Overdue: include anything due up to 30 days ago.
  const windowEnd = new Date(now.getTime() + 48 * 3_600_000)
  const overdueStart = new Date(now.getTime() - 30 * 24 * 3_600_000)

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, title, household_id, assigned_to, next_due_at')
    .not('next_due_at', 'is', null)
    .lte('next_due_at', windowEnd.toISOString())
    .gte('next_due_at', overdueStart.toISOString())
    .neq('is_quick', true)

  if (tasksError) {
    console.error(`CRON_DAILY_PUSH_STARTED tasks_query_error="${tasksError.message}"`)
    return NextResponse.json({ error: tasksError.message }, { status: 500 })
  }

  console.log(`CRON_DAILY_PUSH_STARTED tasks_found=${tasks?.length ?? 0} context=${context}`)
  if (!tasks?.length) return NextResponse.json({ sent: 0, context, tasks_found: 0 })

  // Group tasks: assigned → per user; unassigned → per household
  const assignedByUser = new Map<string, { householdId: string; titles: string[] }>()
  const unassignedByHousehold = new Map<string, string[]>()

  for (const t of tasks) {
    if (!t.household_id) continue
    if (t.assigned_to) {
      const entry = assignedByUser.get(t.assigned_to) ?? { householdId: t.household_id, titles: [] as string[] }
      entry.titles.push(t.title)
      assignedByUser.set(t.assigned_to, entry)
    } else {
      const arr = unassignedByHousehold.get(t.household_id) ?? []
      arr.push(t.title)
      unassignedByHousehold.set(t.household_id, arr)
    }
  }

  // Collect all target user IDs for the log
  const allTargetUserIds: string[] = [
    ...assignedByUser.keys(),
    // unassigned household members will be resolved below
  ]
  console.log(`CRON_DAILY_PUSH_STARTED assigned_users=${assignedByUser.size} unassigned_households=${unassignedByHousehold.size} target_user_ids_direct=${allTargetUserIds.join(',')}`)

  let sent = 0
  let failed = 0
  let throttled = 0
  let removed = 0
  const skipReasons: string[] = []

  // ── Assigned tasks → notify all devices of the specific assigned user ────────
  for (const [userId, { titles }] of assignedByUser) {
    const { data: userSubs } = await supabase
      .from('push_subscriptions')
      .select('subscription, last_sent_at')
      .eq('user_id', userId)
    if (!userSubs?.length) {
      skipReasons.push(`user_${userId}:no_subscription`)
      continue
    }

    // Throttle: skip user if ALL their devices were notified within the last 6h.
    // (Any device with a fresh last_sent_at keeps the whole user throttled.)
    const mostRecent = userSubs.reduce((latest, s) => {
      if (!s.last_sent_at) return latest
      if (!latest) return s.last_sent_at
      return s.last_sent_at > latest ? s.last_sent_at : latest
    }, null as string | null)
    if (mostRecent) {
      const msSinceLast = now.getTime() - new Date(mostRecent).getTime()
      if (msSinceLast < 6 * 3_600_000) {
        console.log(`CRON_DAILY_PUSH_STARTED throttled user=${userId} last_sent_min_ago=${Math.round(msSinceLast / 60000)}`)
        throttled++
        skipReasons.push(`user_${userId}:throttled_${Math.round(msSinceLast / 60000)}m`)
        continue
      }
    }

    let body: string
    try {
      body = await generateAiPushMessage(context, { titles, count: titles.length })
    } catch {
      body = context === 'morning'
        ? `🌅 בוקר טוב! ${titles.length} משימות ממתינות היום`
        : `🌙 ערב טוב! עדיין ${titles.length} משימות ממתינות`
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
        sent++
        console.log(`CRON_DAILY_PUSH_STARTED sent user=${userId} tasks=${titles.length} context=${context}`)
      } catch (err) {
        if (isExpiredSubscription(err)) {
          const code = (err as { statusCode?: number })?.statusCode
          console.log(`CRON_DAILY_PUSH_STARTED removed user=${userId} reason=subscription_expired http=${code}`)
          await supabase.from('push_subscriptions').delete()
            .eq('user_id', userId)
          removed++
        } else {
          console.error(`CRON_DAILY_PUSH_STARTED failed user=${userId} err="${String(err)}"`)
          failed++
        }
      }
    }
  }

  // ── Unassigned tasks → notify all household members ─────────────────────────
  for (const [householdId, titles] of unassignedByHousehold) {
    const { data: members } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', householdId)
    if (!members?.length) continue

    const userIds = members.map(m => m.user_id)
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('user_id, subscription, last_sent_at')
      .in('user_id', userIds)

    console.log(`CRON_DAILY_PUSH_STARTED household=${householdId} unassigned_tasks=${titles.length} subscriptions=${subs?.length ?? 0}`)
    if (!subs?.length) continue

    let body: string
    try {
      body = await generateAiPushMessage(context, { titles, count: titles.length })
    } catch {
      body = context === 'morning'
        ? `🌅 בוקר טוב! ${titles.length} משימות ממתינות היום`
        : `🌙 ערב טוב! עדיין ${titles.length} משימות ממתינות`
    }

    for (const sub of subs) {
      if (sub.last_sent_at) {
        const msSinceLast = now.getTime() - new Date(sub.last_sent_at).getTime()
        if (msSinceLast < 6 * 3_600_000) {
          console.log(`CRON_DAILY_PUSH_STARTED throttled user=${sub.user_id} last_sent_min_ago=${Math.round(msSinceLast / 60000)}`)
          throttled++
          skipReasons.push(`user_${sub.user_id}:throttled_${Math.round(msSinceLast / 60000)}m`)
          continue
        }
      }

      try {
        await webpush.sendNotification(
          sub.subscription as webpush.PushSubscription,
          JSON.stringify({ title: 'HomeBase 🏠', body, url: '/dashboard' })
        )
        await supabase
          .from('push_subscriptions')
          .update({ last_sent_at: now.toISOString() })
          .eq('user_id', sub.user_id)
        sent++
        console.log(`CRON_DAILY_PUSH_STARTED sent user=${sub.user_id} household=${householdId} tasks=${titles.length} context=${context}`)
      } catch (err) {
        if (isExpiredSubscription(err)) {
          const code = (err as { statusCode?: number })?.statusCode
          console.log(`CRON_DAILY_PUSH_STARTED removed user=${sub.user_id} reason=subscription_expired http=${code}`)
          await supabase.from('push_subscriptions').delete()
            .eq('user_id', sub.user_id)
          removed++
        } else {
          console.error(`CRON_DAILY_PUSH_STARTED failed user=${sub.user_id} err="${String(err)}"`)
          failed++
        }
      }
    }
  }

  console.log(`CRON_DAILY_PUSH_STARTED done sent=${sent} throttled=${throttled} failed=${failed} removed=${removed} skip_reasons=${skipReasons.join('|')}`)
  return NextResponse.json({ sent, throttled, failed, removed, context, tasks_found: tasks.length, skip_reasons: skipReasons })
}
