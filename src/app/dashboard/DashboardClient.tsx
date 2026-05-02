'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Task, getTaskStatus, getStatusColor, formatSchedule } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow, isPast, isToday } from 'date-fns'
import { he } from 'date-fns/locale'
import type { User } from '@supabase/supabase-js'
import RoutineCard from '@/components/RoutineCard'
import type { ActiveRoutineEvent } from '@/lib/jewish-calendar'
import { isRoutineActive, isRoutineDone } from '@/lib/routines'

interface Member { user_id: string; display_name: string }
interface RecentLog { done_by: string; done_at: string; tasks: { title: string; icon: string } | { title: string; icon: string }[] | null }

type LeaderEntry = { user_id: string; display_name: string; points: number }

interface Props {
  tasks: Task[]
  user: User
  member: { display_name: string; households: { name: string } | null } | null
  householdId: string | null
  members: Member[]
  recentLogs: RecentLog[]
  initialLeaderboard: LeaderEntry[]
  activeRoutine?: ActiveRoutineEvent
  weekDayCounts?: number[]
  shoppingCount?: number
}

const DISH_TASK_KEYWORDS = ['כלים', 'כיור', 'צלחות', 'סירים', 'ספוג', 'מדיח']
function isDishTask(task: Task): boolean {
  if (!task.is_quick) return false
  return DISH_TASK_KEYWORDS.some(kw => task.title.includes(kw))
}

function estimateNextDue(task: Task): string {
  const value = task.frequency_value
  const unit = task.frequency_unit
  const ms = unit === 'hours' ? value * 3_600_000
    : unit === 'days' ? value * 86_400_000
    : unit === 'weeks' ? value * 7 * 86_400_000
    : value * 30 * 86_400_000
  return new Date(Date.now() + ms).toISOString()
}

export default function DashboardClient({ tasks: initialTasks, user, member, householdId, members, recentLogs, initialLeaderboard, activeRoutine, weekDayCounts, shoppingCount = 0 }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [toastError, setToastError] = useState('')
  const [leaders, setLeaders] = useState<LeaderEntry[]>(initialLeaderboard)
  const [scanningDishes, setScanningDishes] = useState(false)
  const [hostingEvent, setHostingEvent] = useState<ActiveRoutineEvent | null>(null)
  const [dishScanTask, setDishScanTask] = useState<Task | null>(null)
  const dishCameraRef = useRef<HTMLInputElement>(null)
  const supabase = useRef(createClient()).current
  // Tracks quick tasks currently awaiting an API response — prevents duplicate taps
  const inFlightQuickRef = useRef<Set<string>>(new Set())

  function showError(msg: string) {
    setToastError(msg)
    setTimeout(() => setToastError(''), 3000)
  }

  useEffect(() => {
    if (!householdId) return
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `household_id=eq.${householdId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') setTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new as Task : t))
          else if (payload.eventType === 'INSERT') setTasks(prev => [...prev, payload.new as Task].sort((a, b) => (a.next_due_at ?? '').localeCompare(b.next_due_at ?? '')))
          else if (payload.eventType === 'DELETE') setTasks(prev => prev.filter(t => t.id !== (payload.old as Task).id))
        }
      ).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [householdId])

  useEffect(() => {
    try {
      const lastNotify = Number(sessionStorage.getItem('hb_last_notify') ?? '0')
      if (Date.now() - lastNotify > 3_600_000) {
        fetch('/api/push/notify', { method: 'POST' }).catch(() => {})
        sessionStorage.setItem('hb_last_notify', String(Date.now()))
      }
    } catch { /* sessionStorage unavailable */ }
  }, [])

  // Hosting routine: show Thu/Fri only, client-side, per-week key
  useEffect(() => {
    if (!isRoutineActive('hosting')) return
    const now = new Date()
    const dow = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' })
        .format(now)
        .replace('Thu', '4').replace('Fri', '5').replace('Mon', '1')
        .replace('Tue', '2').replace('Wed', '3').replace('Sat', '6').replace('Sun', '0'),
      10,
    )
    if (dow !== 4 && dow !== 5) return // only Thursday or Friday
    const daysUntil = dow === 4 ? 2 : 1
    // ISO-week key matches the Shabbat RoutineCard key so both dismiss together if needed
    const israelToday = new Date(
      parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric' }).format(now)),
      parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', month: 'numeric' }).format(now)) - 1,
      parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', day: 'numeric' }).format(now)),
    )
    const sat = new Date(israelToday)
    sat.setDate(sat.getDate() + daysUntil)
    const jan1 = new Date(sat.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((sat.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
    const eventKey = `hosting-${sat.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
    if (isRoutineDone(eventKey)) return
    setHostingEvent({ type: 'hosting', eventKey, title: 'אירוח', daysUntil })
  }, [])


  const { urgent, upcoming, ok, quickTasks } = useMemo(() => {
    const urgent: Task[] = [], upcoming: Task[] = [], ok: Task[] = [], quickTasks: Task[] = []
    for (const t of tasks) {
      if (t.is_quick) { quickTasks.push(t); continue }
      const s = getTaskStatus(t)
      if (s === 'overdue' || s === 'due_today') urgent.push(t)
      else if (s === 'due_soon') upcoming.push(t)
      else ok.push(t)
    }
    return { urgent, upcoming, ok, quickTasks }
  }, [tasks])

  const [quickFeedback, setQuickFeedback] = useState<Record<string, number | null>>({})
  const [pendingNotify, setPendingNotify] = useState<{ taskId: string; taskTitle: string } | null>(null)
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup notify timer on unmount
  useEffect(() => {
    return () => { if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current) }
  }, [])

  // Optimistically increment the current user's leaderboard score after a task is logged
  function addPointsToLeader(pts: number) {
    setLeaders(prev => {
      const next = prev.map(l =>
        l.user_id === user.id ? { ...l, points: l.points + pts } : l
      )
      return next.sort((a, b) => b.points - a.points)
    })
  }

  function triggerManualNotifyPrompt(task: Task) {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current)
    setPendingNotify({ taskId: task.id, taskTitle: task.title })
    notifyTimerRef.current = setTimeout(() => setPendingNotify(null), 8000)
    console.log(`MANUAL_NOTIFY_UI_RENDERED task=${task.id} taskType=${task.is_quick ? 'quick' : 'recurring'}`)
  }

  async function sendManualNotify() {
    if (!pendingNotify) return
    const { taskId } = pendingNotify
    setPendingNotify(null)
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current)
    console.log(`MANUAL_NOTIFY_CLICKED task=${taskId}`)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'notify_member', task_id: taskId }),
      })
      const data = await res.json()
      console.log(`[dashboard] manual notify sent: sent=${data.sent ?? 0}`)
    } catch {
      console.error('[dashboard] manual notify failed')
    }
  }

  const logQuickTask = useCallback(async (task: Task, pointsOverride?: number) => {
    if (inFlightQuickRef.current.has(task.id)) return
    inFlightQuickRef.current.add(task.id)
    console.log(`QUICK_TASK_HANDLER_REACHED task=${task.id}`)
    console.log(`[dashboard] action=quick_log task=${task.id} route=/api/tasks`)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quick_log', id: task.id, points_override: pointsOverride }),
      })
      const data = await res.json()
      if (!data.error) {
        const pts = data.points ?? 1
        setQuickFeedback(prev => ({ ...prev, [task.id]: pts }))
        addPointsToLeader(pts)
        setTimeout(() => {
          setQuickFeedback(prev => ({ ...prev, [task.id]: null }))
          inFlightQuickRef.current.delete(task.id)
        }, 1500)
        console.log(`AUTO_TASK_PUSH_BLOCKED task=${task.id} taskType=quick`)
        console.log(`[dashboard] quick_log complete task=${task.id} points=${data.points} auto_push=false`)
        // Show manual notify option — user must explicitly click to send push
        if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current)
        setPendingNotify({ taskId: task.id, taskTitle: task.title })
        notifyTimerRef.current = setTimeout(() => setPendingNotify(null), 8000)
        console.log(`MANUAL_NOTIFY_UI_RENDERED task=${task.id} taskType=quick`)
      } else {
        inFlightQuickRef.current.delete(task.id)
      }
    } catch {
      inFlightQuickRef.current.delete(task.id)
    }
  }, [])

  function startDishScan(task: Task) {
    setDishScanTask(task)
    dishCameraRef.current?.click()
  }

  async function handleDishPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !dishScanTask) return
    e.target.value = ''
    setScanningDishes(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]
        const res = await fetch('/api/tasks/scan-dishes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
        })
        const data = await res.json()
        const score = data.score ?? 1
        await logQuickTask(dishScanTask, score)
        setScanningDishes(false)
        setDishScanTask(null)
      }
      reader.onerror = () => setScanningDishes(false)
      reader.readAsDataURL(file)
    } catch {
      setScanningDishes(false)
    }
  }

  // Optimistic markDone: update state immediately, reconcile with server response
  async function markDone(task: Task) {
    console.log(`RECURRING_DONE_HANDLER_REACHED task=${task.id}`)
    console.log(`[dashboard] action=done task=${task.id} taskType=recurring route=/api/tasks`)
    const isOneTime = task.schedule_type === 'one_time'

    if (isOneTime) {
      // Optimistically remove one-time tasks (they're deleted server-side after completion)
      setTasks(prev => prev.filter(t => t.id !== task.id))
    } else {
      // Optimistically push the task into the future so it leaves urgent/upcoming
      setTasks(prev => prev.map(t => t.id === task.id
        ? { ...t, last_done_at: new Date().toISOString(), next_due_at: estimateNextDue(t) }
        : t))
    }

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'done', id: task.id, frequency_value: task.frequency_value, frequency_unit: task.frequency_unit }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      // Reconcile: update with real server values (next_due_at may differ slightly)
      if (!isOneTime) {
        setTasks(prev => prev.map(t => t.id === task.id
          ? { ...t, last_done_at: data.last_done_at, next_due_at: data.next_due_at }
          : t))
      }
      addPointsToLeader(task.points ?? 1)
      console.log(`AUTO_TASK_PUSH_BLOCKED task=${task.id} taskType=recurring`)
      console.log(`[dashboard] markDone complete task=${task.id} auto_push=false manual_notify_ui_shown=true`)
      // Show manual notify option — user must explicitly click to send push
      triggerManualNotifyPrompt(task)
    } catch {
      // Revert optimistic update
      if (isOneTime) {
        setTasks(prev => [...prev, task])
      } else {
        setTasks(prev => prev.map(t => t.id === task.id ? task : t))
      }
      showError('שגיאה — לא ניתן לסמן כבוצע')
    }
  }

  // Optimistic one-time task add from dashboard
  async function addOneTimeTask(title: string, points: number): Promise<void> {
    const tempId = `temp-${Date.now()}`
    const tempTask: Task = {
      id: tempId,
      household_id: householdId ?? '',
      title,
      category: 'other',
      icon: '📋',
      frequency_value: 1,
      frequency_unit: 'days',
      last_done_at: null,
      next_due_at: null,
      assigned_to: null,
      is_quick: false,
      points,
      schedule_type: 'one_time',
      created_by: user.id,
      created_at: new Date().toISOString(),
    }

    setTasks(prev => [tempTask, ...prev])

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add', title, category: 'other', icon: '📋',
          frequency_value: 1, frequency_unit: 'days', is_quick: false,
          assigned_to: '', points, schedule_type: 'one_time',
          schedule_days: [], schedule_time: '08:00', notify_before_hours: 0, due_date: '',
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      // Replace temp with real task from server
      setTasks(prev => prev.map(t => t.id === tempId ? data : t))
    } catch {
      setTasks(prev => prev.filter(t => t.id !== tempId))
      showError('שגיאה ביצירת המשימה')
    }
  }

  function formatDue(task: Task): string {
    if (!task.next_due_at) return ''
    const date = new Date(task.next_due_at)
    if (isPast(date)) return 'באיחור'
    if (isToday(date)) return 'היום'
    return formatDistanceToNow(date, { locale: he, addSuffix: true })
  }

  const householdName = member?.households?.name ?? 'הבית שלנו'
  const displayName = member?.display_name ?? user.email?.split('@')[0] ?? 'משתמש'
  const memberMap = useMemo(() => new Map(members.map(m => [m.user_id, m.display_name])), [members])

  return (
    <>
    {/* Manual notify bar — portalled to document.body so page-in transform doesn't trap fixed positioning */}
    {pendingNotify && householdId && typeof window !== 'undefined' && createPortal(
      <div
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        className="fixed left-3 right-3 z-[9999]"
      >
        <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl rounded-2xl px-4 py-3.5">
          <span className="text-sm text-zinc-700 dark:text-zinc-200 flex-1 min-w-0 truncate">✅ {pendingNotify.taskTitle}</span>
          <button
            onClick={sendManualNotify}
            className="flex-shrink-0 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            הודע לבית
          </button>
          <button
            onClick={() => { setPendingNotify(null); if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current) }}
            className="flex-shrink-0 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 text-base leading-none"
          >
            ✕
          </button>
        </div>
      </div>,
      document.body
    )}

    <div className="max-w-lg mx-auto px-4 pt-7 pb-nav page-in">
      <input ref={dishCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleDishPhoto} />

      {/* Toast error */}
      {toastError && (
        <div className="fixed bottom-28 right-1/2 translate-x-1/2 z-50 bg-rose-600 text-white text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl whitespace-nowrap">
          {toastError}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500">{householdName}</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">שלום, {displayName} 👋</h1>
        </div>
        <div className="w-10 h-10 bg-violet-100 border border-violet-200 rounded-xl flex items-center justify-center text-violet-600 font-bold text-sm flex-shrink-0">
          {(displayName[0] ?? '?').toUpperCase()}
        </div>
      </div>

      {/* Routine prompt cards — Shabbat/Yom Tov (server-detected) then Hosting (client-detected) */}
      {activeRoutine && <RoutineCard event={activeRoutine} />}
      {hostingEvent && <RoutineCard event={hostingEvent} />}

      {/* Leaderboard mini-widget */}
      {leaders.length > 0 && <LeaderWidget entries={leaders} userId={user.id} />}

      {/* Weekly activity strip */}
      {weekDayCounts && weekDayCounts.some(c => c > 0) && (
        <WeeklyStrip counts={weekDayCounts} todayDow={new Date().getDay()} />
      )}

      {/* Shopping quick-link */}
      {shoppingCount > 0 && (
        <a
          href="/shopping"
          className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-3 mb-5 shadow-sm hover:border-violet-200 dark:hover:border-violet-800 transition-colors group"
        >
          <span className="text-xl">🛒</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {shoppingCount === 1 ? 'פריט אחד ברשימת הקניות' : `${shoppingCount} פריטים ברשימת הקניות`}
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">לחץ לפתיחת הרשימה</p>
          </div>
          <svg className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
        </a>
      )}


      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5 mb-7">
        <StatCard count={urgent.length} label="דחופות" variant="red" />
        <StatCard count={upcoming.length} label="בקרוב" variant="yellow" />
        <StatCard count={ok.length} label="בסדר" variant="green" />
      </div>

      {urgent.length > 0 && (
        <Section title="דחוף עכשיו">
          {urgent.map(task => <TaskCard key={task.id} task={task} onDone={markDone} formatDue={formatDue} assignedName={task.assigned_to ? memberMap.get(task.assigned_to) : undefined} />)}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="בקרוב">
          {upcoming.map(task => <TaskCard key={task.id} task={task} onDone={markDone} formatDue={formatDue} assignedName={task.assigned_to ? memberMap.get(task.assigned_to) : undefined} />)}
        </Section>
      )}

      {ok.length > 0 && (
        <Section title="הכל בסדר">
          {ok.map(task => <TaskCard key={task.id} task={task} onDone={markDone} formatDue={formatDue} assignedName={task.assigned_to ? memberMap.get(task.assigned_to) : undefined} />)}
        </Section>
      )}

      {tasks.length === 0 && (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">🎉</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">אין משימות עדיין</p>
          <a
            href="/tasks"
            className="mt-4 inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors active:scale-95"
          >
            הוסף משימה ראשונה →
          </a>
        </div>
      )}

      {tasks.length > 0 && urgent.length === 0 && upcoming.length === 0 && ok.length === 0 && quickTasks.length === tasks.length && (
        <div className="text-center py-10">
          <p className="text-sm text-zinc-400 dark:text-zinc-500">כל המשימות הן מהירות 👇</p>
        </div>
      )}

      {/* Quick tasks */}
      {quickTasks.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">משימות מהירות</p>
          <div className="grid grid-cols-2 gap-2.5">
            {quickTasks.map(task => {
              const feedback = quickFeedback[task.id]
              const done = feedback != null
              const isDish = isDishTask(task)
              const isScanning = scanningDishes && dishScanTask?.id === task.id
              return (
                <div key={task.id} className={`relative border rounded-xl overflow-hidden transition-all duration-150 ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}>
                  <button
                    onClick={() => !done && logQuickTask(task)}
                    disabled={done || isScanning}
                    className="w-full px-4 py-4 text-right active:scale-[0.97] transition-transform duration-150"
                  >
                    {done ? (
                      <div className="flex items-center justify-center gap-1.5 py-1">
                        <span className="text-emerald-600 text-sm font-semibold">✓ +{feedback}</span>
                      </div>
                    ) : isScanning ? (
                      <div className="flex items-center justify-center py-1">
                        <span className="text-zinc-400 dark:text-zinc-500 text-xs">מנתח...</span>
                      </div>
                    ) : (
                      <>
                        <div className="text-xl mb-2">{task.icon}</div>
                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-tight">{task.title}</p>
                        <span className="inline-block mt-2 bg-violet-100 text-violet-600 rounded-full px-2 py-0.5 text-xs font-medium">
                          +{task.points ?? 1} נקודות
                        </span>
                      </>
                    )}
                  </button>
                  {isDish && !done && !isScanning && (
                    <button
                      onClick={() => startDishScan(task)}
                      className="absolute top-2 left-2 w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-violet-100 flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-violet-500 transition-colors duration-150"
                      title="צלם לניקוד לפי כמות כלים"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recentLogs.length > 0 && (
        <div className="mt-2 mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">בוצע היום</p>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800">
            {recentLogs.map((log) => {
              const t = Array.isArray(log.tasks) ? log.tasks[0] : log.tasks
              const name = memberMap.get(log.done_by) ?? 'משתמש'
              const isMe = log.done_by === user.id
              return (
                <div key={`${log.done_by}-${log.done_at}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-base">{t?.icon ?? '✅'}</span>
                  <span className="text-sm text-zinc-700 dark:text-zinc-200 flex-1 truncate">{t?.title}</span>
                  <span className={`text-xs flex-shrink-0 font-medium ${isMe ? 'text-violet-500' : 'text-zinc-400 dark:text-zinc-500'}`}>{name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* One-time task quick-add */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">הוסף משימה חד פעמית</p>
        <OneTimeTaskCard onAdd={addOneTimeTask} />
      </div>
    </div>
    </>
  )
}

function OneTimeTaskCard({ onAdd }: { onAdd: (title: string, points: number) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [points, setPoints] = useState(1)
  const [saving, setSaving] = useState(false)

  const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/30 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all duration-150'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    await onAdd(title.trim(), points)
    setTitle('')
    setPoints(1)
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mb-4 space-y-3">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="שם המשימה"
        required
        className={inputCls}
      />
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 flex-shrink-0">נקודות</span>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => setPoints(n)}
              className={`w-8 h-8 rounded-lg text-xs font-semibold border transition-colors duration-150 ${points === n ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'}`}>
              {n}
            </button>
          ))}
        </div>
        <button type="submit" disabled={saving || !title.trim()}
          className="mr-auto bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors duration-150 active:scale-95">
          {saving ? '...' : 'הוסף'}
        </button>
      </div>
    </form>
  )
}

function WeeklyStrip({ counts, todayDow }: { counts: number[]; todayDow: number }) {
  const DAY_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
  const max = Math.max(...counts, 1)
  const total = counts.reduce((s, c) => s + c, 0)
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">פעילות השבוע</span>
        <span className="text-xs text-violet-600 dark:text-violet-400 font-bold">{total} משימות</span>
      </div>
      <div className="flex items-end justify-between gap-1">
        {counts.map((count, i) => {
          const isToday = i === todayDow
          const isPast = i < todayDow
          const heightPct = count > 0 ? Math.max((count / max) * 100, 20) : 0
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <div className="w-full flex items-end justify-center" style={{ height: 32 }}>
                {count > 0 && (
                  <div
                    className={`w-full rounded-t transition-all duration-500 ${isToday ? 'bg-violet-500' : isPast ? 'bg-violet-300 dark:bg-violet-700' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                    style={{ height: `${heightPct}%` }}
                  />
                )}
                {count === 0 && <div className="w-full h-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800" />}
              </div>
              <span className={`text-[10px] font-medium ${isToday ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                {DAY_HE[i]}
              </span>
              {count > 0 && (
                <span className="text-[9px] text-zinc-400 dark:text-zinc-600 tabular-nums">{count}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LeaderWidget({ entries, userId }: { entries: LeaderEntry[]; userId: string }) {
  const medals = ['🥇', '🥈', '🥉']
  return (
    <a href="/leaderboard" className="flex items-center gap-3 bg-gradient-to-l from-violet-50 to-white dark:from-violet-950/30 dark:to-zinc-900 border border-violet-100 rounded-2xl px-4 py-3.5 mb-6 active:opacity-80 transition-opacity">
      <span className="text-xl">🏆</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wide mb-2">דירוג החודש</p>
        <div className="flex items-center gap-4">
          {entries.map((e, i) => (
            <div key={e.user_id} className="flex items-center gap-1.5">
              <span className="text-sm">{medals[i]}</span>
              <span className={`text-sm font-medium ${e.user_id === userId ? 'text-violet-600' : 'text-zinc-500 dark:text-zinc-400'}`}>{e.display_name.split(' ')[0]}</span>
              <span className={`text-xs tabular-nums font-semibold ${e.user_id === userId ? 'text-violet-500' : 'text-zinc-400 dark:text-zinc-500'}`}>{e.points}</span>
            </div>
          ))}
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300 dark:text-zinc-600 flex-shrink-0"><path d="M15 18l-6-6 6-6" /></svg>
    </a>
  )
}

function StatCard({ count, label, variant }: { count: number; label: string; variant: 'red' | 'yellow' | 'green' }) {
  const styles = {
    red: {
      top: count > 0 ? 'border-t-rose-400' : 'border-t-zinc-200',
      num: count > 0 ? 'text-rose-500' : 'text-zinc-300',
    },
    yellow: {
      top: count > 0 ? 'border-t-amber-400' : 'border-t-zinc-200',
      num: count > 0 ? 'text-amber-500' : 'text-zinc-300',
    },
    green: {
      top: count > 0 ? 'border-t-emerald-400' : 'border-t-zinc-200',
      num: count > 0 ? 'text-emerald-500' : 'text-zinc-300',
    },
  }
  return (
    <div className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-t-2 ${styles[variant].top} rounded-xl p-3.5 text-center`}>
      <div className={`text-2xl font-bold tabular-nums ${styles[variant].num}`}>{count}</div>
      <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">{label}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function TaskCard({ task, onDone, formatDue, assignedName }: {
  task: Task; onDone: (t: Task) => void; formatDue: (t: Task) => string; assignedName?: string
}) {
  const status = getTaskStatus(task)
  const statusColor = getStatusColor(status)
  const accentBorder = status === 'overdue' ? 'border-r-rose-400' : status === 'due_today' ? 'border-r-orange-400' : status === 'due_soon' ? 'border-r-amber-400' : 'border-r-zinc-200'
  return (
    <div className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-r-4 ${accentBorder} rounded-xl p-4 flex items-center gap-3`}>
      <div className="text-xl w-9 h-9 flex items-center justify-center flex-shrink-0 bg-zinc-50 dark:bg-zinc-800 rounded-lg">{task.icon || '📋'}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm truncate">{task.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <p className={`text-xs font-medium ${statusColor}`}>{formatDue(task)}</p>
          {formatDue(task) && <span className="text-zinc-300 dark:text-zinc-600 text-xs">·</span>}
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{formatSchedule(task)}</p>
          {assignedName && <><span className="text-zinc-300 text-xs">·</span><p className="text-xs text-violet-500 font-medium">{assignedName}</p></>}
        </div>
        {task.last_done_at && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">בוצע {formatDistanceToNow(new Date(task.last_done_at), { locale: he, addSuffix: true })}</p>
        )}
      </div>
      <button
        onClick={() => onDone(task)}
        className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-50 hover:bg-violet-100 border border-violet-200 flex items-center justify-center transition-colors duration-150 text-violet-500 active:scale-95"
        aria-label="סמן כבוצע"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
      </button>
    </div>
  )
}

