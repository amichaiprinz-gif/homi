import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeNextDue, computeNextDueWeekly } from '@/lib/date'
import webpush from 'web-push'
import { generateAiPushMessage } from '@/lib/ai-push'

export async function POST(request: NextRequest) {
  if (process.env.VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  if (action === 'add') {
    const { title, description, category, icon, frequency_value, frequency_unit, is_quick, assigned_to, points,
      schedule_type, schedule_days, schedule_time, notify_before_hours } = body

    const { data: memberRows } = await supabase
      .from('household_members').select('household_id').eq('user_id', user.id)
      .order('created_at', { ascending: false })
    const member = memberRows?.[0] ?? null

    const schedType: string = schedule_type ?? 'recurring'
    let nextDue: string | null = null
    if (!is_quick) {
      if (schedType === 'one_time') {
        nextDue = body.due_date ? new Date(body.due_date).toISOString() : null
      } else if (schedType === 'weekly' && schedule_days?.length) {
        nextDue = computeNextDueWeekly(schedule_days, schedule_time ?? '08:00', new Date())
      } else {
        nextDue = computeNextDue(frequency_value, frequency_unit, new Date())
      }
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title, description: description?.trim() || null, category, icon,
        frequency_value: is_quick ? 1 : (frequency_value ?? 7),
        frequency_unit: is_quick ? 'days' : (frequency_unit ?? 'days'),
        is_roborock: false,
        is_quick: is_quick ?? false,
        assigned_to: assigned_to || null,
        points: points ? Math.min(Math.max(Number(points), 1), 10) : 1,
        created_by: user.id,
        household_id: member?.household_id ?? null,
        last_done_at: null,
        next_due_at: nextDue,
        schedule_type: schedType,
        schedule_days: schedule_days?.length ? schedule_days : null,
        schedule_time: schedule_time || null,
        notify_before_hours: notify_before_hours ?? 1,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Immediate push to all devices of the assigned member (if assigned to someone else)
    if (assigned_to && assigned_to !== user.id) {
      try {
        const adminPush = createAdminClient()
        const [assignerRes, assigneeSubs] = await Promise.all([
          supabase.from('household_members').select('display_name').eq('user_id', user.id).maybeSingle(),
          adminPush.from('push_subscriptions').select('endpoint, subscription').eq('user_id', assigned_to),
        ])
        if (assigneeSubs.data?.length) {
          const msgBody = await generateAiPushMessage('task_assigned', {
            assignerName: assignerRes.data?.display_name ?? 'מישהו',
            taskTitle: title,
          })
          for (const sub of assigneeSubs.data) {
            try {
              await webpush.sendNotification(
                sub.subscription as webpush.PushSubscription,
                JSON.stringify({ title: '📋 משימה חדשה עליך', body: msgBody, url: '/tasks' })
              )
            } catch (sendErr) {
              const code = (sendErr as { statusCode?: number })?.statusCode
              if (code === 404 || code === 410) {
                await adminPush.from('push_subscriptions').delete()
                  .eq('user_id', assigned_to).eq('endpoint', sub.endpoint ?? '')
              }
            }
          }
          console.log(`[tasks] add assignment_push_sent to=${assigned_to} devices=${assigneeSubs.data.length}`)
        }
      } catch (err) {
        // Non-fatal — task was saved successfully, push failure is best-effort
        console.error('[tasks] add assignment_push_failed:', String(err))
      }
    }

    return NextResponse.json(data)
  }

  if (action === 'update') {
    const { id, title, description, category, icon, frequency_value, frequency_unit, is_quick, assigned_to, last_done_at, points,
      schedule_type, schedule_days, schedule_time, notify_before_hours,
      previous_assigned_to } = body

    const schedType: string = schedule_type ?? 'recurring'
    let nextDue: string | null = null
    if (!is_quick) {
      if (schedType === 'one_time') {
        nextDue = body.due_date ? new Date(body.due_date).toISOString() : null
      } else if (schedType === 'weekly' && schedule_days?.length) {
        const from = last_done_at ? new Date(last_done_at) : new Date()
        nextDue = computeNextDueWeekly(schedule_days, schedule_time ?? '08:00', from)
      } else {
        nextDue = last_done_at
          ? computeNextDue(frequency_value, frequency_unit, new Date(last_done_at))
          : computeNextDue(frequency_value, frequency_unit, new Date())
      }
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({
        title, description: description?.trim() || null, category, icon,
        frequency_value: is_quick ? 1 : (frequency_value ?? 7),
        frequency_unit: is_quick ? 'days' : (frequency_unit ?? 'days'),
        is_quick: is_quick ?? false,
        assigned_to: assigned_to || null,
        next_due_at: nextDue,
        points: points ? Math.min(Math.max(Number(points), 1), 10) : 1,
        schedule_type: schedType,
        schedule_days: schedule_days?.length ? schedule_days : null,
        schedule_time: schedule_time || null,
        notify_before_hours: notify_before_hours ?? 1,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Push only when assignment changed to a different person (not self)
    const assignmentChanged = assigned_to && assigned_to !== (previous_assigned_to ?? null) && assigned_to !== user.id
    if (assignmentChanged) {
      try {
        const adminPush = createAdminClient()
        const [assignerRes, assigneeSubs] = await Promise.all([
          supabase.from('household_members').select('display_name').eq('user_id', user.id).maybeSingle(),
          adminPush.from('push_subscriptions').select('endpoint, subscription').eq('user_id', assigned_to),
        ])
        if (assigneeSubs.data?.length) {
          const msgBody = await generateAiPushMessage('task_assigned', {
            assignerName: assignerRes.data?.display_name ?? 'מישהו',
            taskTitle: title,
          })
          for (const sub of assigneeSubs.data) {
            try {
              await webpush.sendNotification(
                sub.subscription as webpush.PushSubscription,
                JSON.stringify({ title: '📋 משימה חדשה עליך', body: msgBody, url: '/tasks' })
              )
            } catch (sendErr) {
              const code = (sendErr as { statusCode?: number })?.statusCode
              if (code === 404 || code === 410) {
                await adminPush.from('push_subscriptions').delete()
                  .eq('user_id', assigned_to).eq('endpoint', sub.endpoint ?? '')
              }
            }
          }
          console.log(`[tasks] update assignment_push_sent to=${assigned_to} devices=${assigneeSubs.data.length}`)
        }
      } catch (err) {
        console.error('[tasks] update assignment_push_failed:', String(err))
      }
    }

    return NextResponse.json(data)
  }

  if (action === 'quick_log') {
    const { id, points_override } = body
    const nowISO = new Date().toISOString()
    console.log(`[tasks] action=quick_log user=${user.id} task=${id}`)

    const [logRes, taskRes] = await Promise.all([
      supabase.from('task_logs').insert({ task_id: id, done_by: user.id, done_at: nowISO }),
      supabase.from('tasks').update({ last_done_at: nowISO }).eq('id', id).select('points, household_id').single(),
    ])
    if (logRes.error) return NextResponse.json({ error: logRes.error.message }, { status: 400 })
    const basePoints = taskRes.data?.points ?? 1
    const finalPoints = points_override ? Math.min(Math.max(Number(points_override), 1), 5) : basePoints
    const householdId = taskRes.data?.household_id ?? null

    // Overtake detection — quick tasks must participate in leaderboard overtake pushes
    console.log(`AUTO_TASK_PUSH_BLOCKED action=quick_log user=${user.id} task=${id}`)
    console.log(`[tasks] quick_log auto_push=false overtake_detection=running`)
    if (householdId) {
      const admin = createAdminClient()
      const { data: doerMember } = await supabase.from('household_members').select('display_name').eq('user_id', user.id).maybeSingle()
      if (doerMember) {
        const now = new Date()
        const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
        // Use admin client — RLS blocks reading other users' task_logs with the user-scoped client
        const { data: householdMembers } = await admin.from('household_members').select('user_id').eq('household_id', householdId)
        const householdMemberIds = (householdMembers ?? []).map(m => m.user_id)
        const { data: monthLogs } = await admin.from('task_logs').select('done_by, tasks(points)').gte('done_at', monthStart.toISOString()).in('done_by', householdMemberIds)
        const totals = new Map<string, number>()
        for (const log of monthLogs ?? []) {
          const taskData = log.tasks as any
          let pts = 1
          if (Array.isArray(taskData) && taskData.length > 0) pts = taskData[0]?.points ?? 1
          else if (taskData && typeof taskData === 'object') pts = taskData.points ?? 1
          totals.set(log.done_by, (totals.get(log.done_by) ?? 0) + pts)
        }
        const myNew = totals.get(user.id) ?? 0
        const myOld = myNew - finalPoints
        const overtakenIds: string[] = []
        for (const [uid, theirPts] of totals) {
          if (uid === user.id) continue
          if (myOld <= theirPts && myNew > theirPts) overtakenIds.push(uid)
        }
        console.log(`OVERTAKE_CHECK_RAN action=quick_log myOld=${myOld} myNew=${myNew} household_members=${householdMemberIds.length} totals_entries=${totals.size} overtakenIds=${JSON.stringify(overtakenIds)}`)
        if (overtakenIds.length) {
          const [overtakenMembers, overtakenSubsRes] = await Promise.all([
            admin.from('household_members').select('user_id, display_name').in('user_id', overtakenIds),
            // Use admin client — RLS blocks reading other users' push_subscriptions
            admin.from('push_subscriptions').select('user_id, subscription').in('user_id', overtakenIds),
          ])
          for (const sub of overtakenSubsRes.data ?? []) {
            const memberName = overtakenMembers.data?.find(m => m.user_id === sub.user_id)?.display_name ?? '?'
            const byPoints = myNew - (totals.get(sub.user_id) ?? 0)
            try {
              const burnMsg = await generateAiPushMessage('overtake', { overtakerName: doerMember.display_name, overtakenName: memberName, byPoints })
              await webpush.sendNotification(sub.subscription as webpush.PushSubscription, JSON.stringify({ title: '🏃 נעקפת!', body: burnMsg, url: '/leaderboard' }))
              console.log(`OVERTAKE_PUSH_SENT action=quick_log to=${sub.user_id}`)
            } catch (err) {
              const code = (err as { statusCode?: number })?.statusCode
              console.error(`[tasks] quick_log overtake send failed to ${sub.user_id} HTTP=${code}`)
              if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('user_id', sub.user_id)
            }
          }
        } else {
          console.log(`[tasks] quick_log no overtake detected`)
        }
      }
    }

    console.log(`[tasks] quick_log complete: points=${finalPoints} auto_push=false`)
    return NextResponse.json({ success: true, points: finalPoints, last_done_at: nowISO })
  }

  if (action === 'done') {
    const { id } = body
    const now = new Date()
    const nowISO = now.toISOString()

    // Fetch full task to determine schedule and notification targets
    const { data: task } = await supabase
      .from('tasks')
      .select('title, points, household_id, assigned_to, schedule_type, schedule_days, schedule_time, frequency_value, frequency_unit')
      .eq('id', id)
      .maybeSingle()

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // Compute next due based on schedule type
    let nextDue: string | null = null
    const schedType = task.schedule_type ?? 'recurring'
    if (schedType === 'one_time') {
      nextDue = null
    } else if (schedType === 'weekly' && task.schedule_days?.length) {
      nextDue = computeNextDueWeekly(task.schedule_days, task.schedule_time ?? '08:00', now)
    } else {
      nextDue = computeNextDue(task.frequency_value, task.frequency_unit, now)
    }

    if (schedType === 'one_time') {
      // One-time tasks are deleted after completion — log first, then delete
      await supabase.from('task_logs').insert({ task_id: id, done_by: user.id, done_at: nowISO })
      await supabase.from('tasks').delete().eq('id', id)
    } else {
      await Promise.all([
        supabase.from('tasks').update({ last_done_at: nowISO, next_due_at: nextDue }).eq('id', id),
        supabase.from('task_logs').insert({ task_id: id, done_by: user.id, done_at: nowISO }),
      ])
    }

    console.log(`AUTO_TASK_PUSH_BLOCKED action=done user=${user.id} task=${id}`)
    console.log(`[tasks] action=done user=${user.id} task=${id} auto_push=false manual_notify=UI_shown_on_client`)

    // Overtake detection only — automatic task_done push removed; manual notify handled by client
    if (task.household_id) {
      const admin = createAdminClient()
      const { data: doerMember } = await supabase
        .from('household_members')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle()

      // ── Overtake detection ──────────────────────────────────────────────
      if (doerMember) {
        const taskPts = task.points ?? 1
        const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0,0,0,0)

        // Use admin client — RLS blocks reading other users' task_logs with the user-scoped client
        const { data: householdMembers } = await admin.from('household_members').select('user_id').eq('household_id', task.household_id)
        const householdMemberIds = (householdMembers ?? []).map(m => m.user_id)
        const { data: monthLogs } = await admin
          .from('task_logs')
          .select('done_by, tasks(points)')
          .gte('done_at', monthStart.toISOString())
          .in('done_by', householdMemberIds)

        // Aggregate current totals (the just-inserted log is already included)
        const totals = new Map<string, number>()
        for (const log of monthLogs ?? []) {
          const taskData = log.tasks as any
          let pts = 1
          if (Array.isArray(taskData) && taskData.length > 0) {
            pts = taskData[0]?.points ?? 1
          } else if (taskData && typeof taskData === 'object') {
            pts = taskData.points ?? 1
          }
          totals.set(log.done_by, (totals.get(log.done_by) ?? 0) + pts)
        }

        const myNew = totals.get(user.id) ?? 0
        const myOld = myNew - taskPts

        // Find users the current user just jumped over
        const overtakenIds: string[] = []
        for (const [uid, theirPts] of totals) {
          if (uid === user.id) continue
          if (myOld <= theirPts && myNew > theirPts) overtakenIds.push(uid)
        }
        console.log(`OVERTAKE_CHECK_RAN action=done myOld=${myOld} myNew=${myNew} household_members=${householdMemberIds.length} totals_entries=${totals.size} overtakenIds=${JSON.stringify(overtakenIds)}`)

        if (overtakenIds.length) {
          const [overtakenMembers, overtakenSubsRes] = await Promise.all([
            admin.from('household_members').select('user_id, display_name').in('user_id', overtakenIds),
            // Use admin client — RLS blocks reading other users' push_subscriptions
            admin.from('push_subscriptions').select('user_id, subscription').in('user_id', overtakenIds),
          ])

          for (const sub of overtakenSubsRes.data ?? []) {
            const memberName = overtakenMembers.data?.find(m => m.user_id === sub.user_id)?.display_name ?? '?'
            const byPoints = myNew - (totals.get(sub.user_id) ?? 0)
            try {
              const burnMsg = await generateAiPushMessage('overtake', {
                overtakerName: doerMember.display_name,
                overtakenName: memberName,
                byPoints,
              })
              await webpush.sendNotification(
                sub.subscription as webpush.PushSubscription,
                JSON.stringify({ title: '🏃 נעקפת!', body: burnMsg, url: '/leaderboard' })
              )
              console.log(`OVERTAKE_PUSH_SENT action=done to=${sub.user_id}`)
            } catch (err) {
              const code = (err as { statusCode?: number })?.statusCode
              console.error(`[tasks] done overtake send failed to ${sub.user_id} HTTP=${code}`)
              if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('user_id', sub.user_id)
            }
          }
        } else {
          console.log(`[tasks] done no overtake detected`)
        }
      }
    }

    return NextResponse.json({ last_done_at: nowISO, next_due_at: nextDue })
  }

  if (action === 'notify_member') {
    const { task_id } = body
    console.log(`TASK_NOTIFY_ROUTE_HIT user=${user.id} task=${task_id}`)

    const { data: task } = await supabase.from('tasks').select('title, icon, household_id').eq('id', task_id).maybeSingle()
    if (!task?.household_id) {
      console.log(`[tasks] notify_member task_not_found task=${task_id}`)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    console.log(`[tasks] notify_member caller_household_id=${task.household_id}`)

    const { data: doerMember } = await supabase.from('household_members').select('display_name').eq('user_id', user.id).maybeSingle()
    const { data: otherMembers } = await supabase.from('household_members').select('user_id').eq('household_id', task.household_id).neq('user_id', user.id)
    const otherIds = (otherMembers ?? []).map(m => m.user_id)
    console.log(`[tasks] notify_member target_user_ids=${JSON.stringify(otherIds)}`)

    if (!otherIds.length) {
      console.log(`[tasks] notify_member skip_reason=no_other_members`)
      return NextResponse.json({ success: true, sent: 0 })
    }

    // Use admin client — RLS blocks a regular user from reading other users' push_subscriptions
    const adminSupabase = createAdminClient()
    const { data: subs, error: subsError } = await adminSupabase
      .from('push_subscriptions')
      .select('user_id, subscription')
      .in('user_id', otherIds)
    console.log(`[tasks] notify_member subscriptions_found=${subs?.length ?? 0} subsError=${subsError?.message ?? 'none'} target_subscriptions_user_ids=${JSON.stringify((subs ?? []).map(s => s.user_id))}`)

    if (!subs?.length) {
      console.log(`[tasks] notify_member skip_reason=no_subscriptions_for_targets`)
      return NextResponse.json({ success: true, sent: 0 })
    }

    const msgBody = await generateAiPushMessage('task_done', { taskTitle: task.title, doerName: doerMember?.display_name ?? '?' })
    let sent = 0
    let failed = 0
    let removed = 0
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub.subscription as webpush.PushSubscription, JSON.stringify({ title: `✅ ${task.title}`, body: msgBody, url: '/dashboard' }))
        sent++
        console.log(`[tasks] notify_member push sent to ${sub.user_id}`)
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) {
          await adminSupabase.from('push_subscriptions').delete().eq('user_id', sub.user_id)
          removed++
          console.log(`[tasks] notify_member subscription expired for ${sub.user_id} (HTTP ${code}) — removed`)
        } else {
          failed++
          console.error(`[tasks] notify_member transient error for ${sub.user_id}:`, String(err))
        }
      }
    }
    console.log(`[tasks] notify_member complete sent=${sent} failed=${failed} removed=${removed}`)
    return NextResponse.json({ success: true, sent, failed, removed })
  }

  if (action === 'delete') {
    const { id } = body
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
