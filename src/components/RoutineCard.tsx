'use client'

import { useState, useEffect } from 'react'
import type { ActiveRoutineEvent } from '@/lib/jewish-calendar'
import {
  getRoutineTasks,
  isRoutineActive,
  markRoutineDone,
  markRoutineDismissed,
  isRoutineDone,
  type RoutineTask,
} from '@/lib/routines'

interface Props {
  event: ActiveRoutineEvent
}

type CardState = 'checking' | 'visible' | 'creating' | 'done' | 'hidden'

export default function RoutineCard({ event }: Props) {
  const [state, setState] = useState<CardState>('checking')
  const [tasks, setTasks] = useState<RoutineTask[]>([])
  const [createdCount, setCreatedCount] = useState(0)

  // Check localStorage on client: dismissed / already done / routine disabled
  useEffect(() => {
    if (isRoutineDone(event.eventKey) || !isRoutineActive(event.type)) {
      setState('hidden')
      return
    }
    const enabled = getRoutineTasks(event.type).filter(t => t.enabled)
    setTasks(enabled)
    setState('visible')
  }, [event.eventKey, event.type])

  async function handleConfirm() {
    if (state !== 'visible' || tasks.length === 0) return
    setState('creating')
    try {
      const res = await fetch('/api/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_tasks',
          routineType: event.type,
          eventTitle: event.title,
          tasks: tasks.map(t => ({ title: t.title, icon: t.icon, category: t.category, points: t.points })),
        }),
      })
      const data = await res.json()
      if (!data.error) {
        markRoutineDone(event.eventKey)
        setCreatedCount(data.created ?? tasks.length)
        setState('done')
        setTimeout(() => setState('hidden'), 4000)
      } else {
        setState('visible')
      }
    } catch {
      setState('visible')
    }
  }

  function handleDismiss() {
    markRoutineDismissed(event.eventKey)
    setState('hidden')
  }

  if (state === 'checking' || state === 'hidden') return null

  const icon = event.type === 'shabbat' ? '🕯️' : event.type === 'hosting' ? '🍽️' : '✡️'
  const question = event.type === 'shabbat'
    ? 'מתארגנים לשבת?'
    : event.type === 'hosting'
      ? 'מארחים השבת? ניצור משימות אירוח'
      : `מתארגנים ל${event.title}?`
  const daysLabel = event.daysUntil === 0 ? 'היום' : event.daysUntil === 1 ? 'מחר' : `עוד ${event.daysUntil} ימים`

  if (state === 'done') {
    return (
      <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl px-4 py-3 mb-5">
        <span className="text-lg">✅</span>
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
          נוצרו {createdCount} משימות ל{event.title} — בהצלחה!
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-4 mb-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">{icon}</span>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {event.title} — {daysLabel}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{question}</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors duration-150 flex-shrink-0 mt-0.5"
          aria-label="סגור"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Task preview chips */}
      {tasks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3.5">
          {tasks.slice(0, 5).map(t => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 text-[11px] bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 px-2 py-1 rounded-lg"
            >
              {t.icon} {t.title}
            </span>
          ))}
          {tasks.length > 5 && (
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1 py-1 self-center">
              +{tasks.length - 5} עוד
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={state === 'creating'}
          className="flex-1 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors duration-150"
        >
          {state === 'creating' ? 'יוצר משימות...' : 'כן, צור משימות'}
        </button>
        <button
          onClick={handleDismiss}
          className="px-4 py-2.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-colors duration-150"
        >
          לא
        </button>
      </div>
    </div>
  )
}
