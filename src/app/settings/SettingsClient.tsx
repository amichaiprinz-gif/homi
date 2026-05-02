'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BackButton from '@/components/BackButton'
import { createClient } from '@/lib/supabase/client'
import { forceRegisterPush } from '@/components/PushInitializer'
import type { User } from '@supabase/supabase-js'
import {
  DEFAULT_TASKS, ROUTINE_INFO, getRoutineTasks, saveRoutineTasks,
  isRoutineActive, setRoutineActive,
  type RoutineTask, type RoutineType,
} from '@/lib/routines'

interface Member { user_id: string; display_name: string; role: string }
interface Props {
  user: User
  member: { display_name: string; role: string; invite_code?: string; households: { name: string; invite_code: string } | null } | null
  members: Member[]
}

const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all duration-150'

export default function SettingsClient({ user, member, members }: Props) {
  const [displayName, setDisplayName] = useState(member?.display_name ?? '')
  const [householdName, setHouseholdName] = useState(member?.households?.name ?? '')
  const [inviteCode, setInviteCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [confirmAction, setConfirmAction] = useState<'leave' | 'signout' | null>(null)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(null)
  const [pushSubscribed, setPushSubscribed] = useState<boolean | null>(null)
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)
  const [pushActionLoading, setPushActionLoading] = useState(false)
  const router = useRouter()

  // ── Routines state ──────────────────────────────────────────────────────────
  const ROUTINE_TYPES: RoutineType[] = ['shabbat', 'yom_tov', 'hosting']
  const [routineActive, setRoutineActiveState] = useState<Record<RoutineType, boolean>>({ shabbat: true, yom_tov: true, hosting: true })
  const [routineTasks, setRoutineTasks] = useState<Record<RoutineType, RoutineTask[]>>({
    shabbat: DEFAULT_TASKS.shabbat,
    yom_tov: DEFAULT_TASKS.yom_tov,
    hosting: DEFAULT_TASKS.hosting,
  })
  const [expandedRoutine, setExpandedRoutine] = useState<RoutineType | null>(null)
  const [newTaskTitles, setNewTaskTitles] = useState<Record<RoutineType, string>>({ shabbat: '', yom_tov: '', hosting: '' })
  const [routineSaved, setRoutineSaved] = useState<Record<RoutineType, boolean>>({ shabbat: false, yom_tov: false, hosting: false })
  const inviteCodeDisplay = member?.households?.invite_code


  useEffect(() => {
    const stored = localStorage.getItem('hb_theme')
    if (stored === 'dark') setTheme('dark')
  }, [])


  // Load routines from localStorage on mount
  useEffect(() => {
    setRoutineActiveState({
      shabbat: isRoutineActive('shabbat'),
      yom_tov: isRoutineActive('yom_tov'),
      hosting: isRoutineActive('hosting'),
    })
    setRoutineTasks({
      shabbat: getRoutineTasks('shabbat'),
      yom_tov: getRoutineTasks('yom_tov'),
      hosting: getRoutineTasks('hosting'),
    })
  }, [])

  function toggleRoutine(type: RoutineType, active: boolean) {
    setRoutineActive(type, active)
    setRoutineActiveState(prev => ({ ...prev, [type]: active }))
  }

  function toggleTask(type: RoutineType, id: string) {
    const next = routineTasks[type].map(t => t.id === id ? { ...t, enabled: !t.enabled } : t)
    setRoutineTasks(prev => ({ ...prev, [type]: next }))
  }

  function addTask(type: RoutineType) {
    const title = newTaskTitles[type].trim()
    if (!title) return
    const newTask: RoutineTask = { id: `custom-${Date.now()}`, title, icon: '📋', category: 'other', points: 1, enabled: true }
    const next = [...routineTasks[type], newTask]
    setRoutineTasks(prev => ({ ...prev, [type]: next }))
    setNewTaskTitles(prev => ({ ...prev, [type]: '' }))
  }

  function removeTask(type: RoutineType, id: string) {
    const next = routineTasks[type].filter(t => t.id !== id)
    setRoutineTasks(prev => ({ ...prev, [type]: next }))
  }

  function saveRoutine(type: RoutineType) {
    saveRoutineTasks(type, routineTasks[type])
    setRoutineSaved(prev => ({ ...prev, [type]: true }))
    setTimeout(() => setRoutineSaved(prev => ({ ...prev, [type]: false })), 2000)
  }

  function resetRoutine(type: RoutineType) {
    setRoutineTasks(prev => ({ ...prev, [type]: DEFAULT_TASKS[type] }))
    saveRoutineTasks(type, DEFAULT_TASKS[type])
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setNotifPermission(Notification.permission)
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => setPushSubscribed(!!sub))
        .catch(() => setPushSubscribed(false))
    }
    fetch('/api/push/subscribe')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.last_sent_at) setLastSentAt(data.last_sent_at) })
      .catch(() => {})
  }, [])

  function toggleTheme(t: 'light' | 'dark') {
    setTheme(t)
    localStorage.setItem('hb_theme', t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  }

  async function callApi(body: Record<string, unknown>) {
    const res = await fetch('/api/household', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return res.json()
  }

  async function saveProfile() {
    if (!member) { setMessage('יש ליצור בית תחילה'); setTimeout(() => setMessage(''), 2000); return }
    setSaving(true)
    try {
      const data = await callApi({ action: 'update_name', displayName })
      setMessage(data.error ? `שגיאה: ${data.error}` : 'נשמר')
    } catch { setMessage('שגיאת רשת') }
    setSaving(false)
    setTimeout(() => setMessage(''), 3000)
  }

  async function createHousehold() {
    setSaving(true); setMessage('')
    try {
      const data = await callApi({ action: 'create', name: householdName, displayName })
      if (data.error) { setMessage(`שגיאה: ${data.error}`); setSaving(false); return }
      router.refresh()
    } catch { setMessage('שגיאת רשת') }
    setSaving(false)
  }

  async function joinHousehold() {
    if (!inviteCode) return; setSaving(true)
    try {
      const data = await callApi({ action: 'join', inviteCode, displayName })
      if (data.error) setMessage(`שגיאה: ${data.error}`)
      else { setMessage('הצטרפת בהצלחה!'); router.refresh() }
    } catch { setMessage('שגיאת רשת') }
    setSaving(false); setTimeout(() => setMessage(''), 2000)
  }

  async function leaveHousehold() { setConfirmAction('leave') }
  async function doLeaveHousehold() {
    setConfirmAction(null); setSaving(true)
    await callApi({ action: 'leave' })
    router.refresh(); setSaving(false)
  }

  async function copyInviteCode() {
    if (!inviteCodeDisplay) return
    await navigator.clipboard.writeText(inviteCodeDisplay)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function signOut() { setConfirmAction('signout') }
  async function doSignOut() { setConfirmAction(null); await createClient().auth.signOut(); router.push('/login') }

  async function handleSubscribePush() {
    setPushActionLoading(true)
    const ok = await forceRegisterPush()
    if (ok) { setPushSubscribed(true); setNotifPermission('granted') }
    setPushActionLoading(false)
  }
  async function handleUnsubscribePush() {
    setPushActionLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      const endpoint = sub?.endpoint ?? null
      if (sub) await sub.unsubscribe()
      // Pass endpoint so only this device's subscription is removed,
      // leaving other household devices subscribed.
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
      setPushSubscribed(false)
    } catch { /* silently fail */ }
    setPushActionLoading(false)
  }

  return (
    <>
    {/* Confirm action modal */}
    {confirmAction && (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
        onClick={() => setConfirmAction(null)}
      >
        <div
          className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl px-5 pt-6 pb-10 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">
            {confirmAction === 'leave' ? 'לעזוב את הבית?' : 'להתנתק?'}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            {confirmAction === 'leave'
              ? 'תצא מהבית הזה. תוכל להצטרף שוב עם קוד הזמנה.'
              : 'תוכל להתחבר מחדש בכל עת עם האימייל והסיסמה שלך.'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmAction(null)}
              className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 py-3 rounded-xl text-sm font-semibold transition-colors duration-150"
            >
              ביטול
            </button>
            <button
              onClick={confirmAction === 'leave' ? doLeaveHousehold : doSignOut}
              disabled={saving}
              className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-semibold transition-colors duration-150"
            >
              {confirmAction === 'leave' ? 'עזוב' : 'התנתק'}
            </button>
          </div>
        </div>
      </div>
    )}
    <div className="max-w-lg mx-auto px-4 pt-7 pb-nav page-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">הגדרות</h1>
        <BackButton />
      </div>

      {message && (
        <div className={`text-sm px-4 py-3 rounded-2xl mb-5 text-center border font-medium ${message.startsWith('שגיאה') || message === 'שגיאת רשת' ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400'}`}>
          {message}
        </div>
      )}

      {/* Profile */}
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">פרופיל</p>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-5">
        <form onSubmit={e => { e.preventDefault(); saveProfile() }} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">שם תצוגה</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputCls} placeholder="השם שלך" />
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{user.email}</p>
          <button type="submit" disabled={saving} className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors duration-150">
            שמור
          </button>
        </form>
      </div>

      {/* Theme */}
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">מצב תצוגה</p>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ערכת נושא</span>
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 gap-1">
            <button
              onClick={() => toggleTheme('light')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${theme === 'light' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              בהיר
            </button>
            <button
              onClick={() => toggleTheme('dark')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${theme === 'dark' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              כהה
            </button>
          </div>
        </div>
      </div>

      {/* Household */}
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">בית</p>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-5">
        {member?.households ? (
          <div className="space-y-4">
            <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{member.households.name}</p>

            {inviteCodeDisplay && (
              <div className="flex items-center justify-between bg-violet-50 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-800/60 rounded-xl px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400 mb-1">קוד הזמנה</p>
                  <p className="font-mono font-bold text-violet-700 dark:text-violet-400 tracking-[0.2em] text-lg">{inviteCodeDisplay}</p>
                </div>
                <button
                  onClick={copyInviteCode}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-all duration-150 ${copied ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-violet-300 hover:text-violet-600'}`}
                >
                  {copied ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>הועתק</>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>העתק</>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <form onSubmit={e => { e.preventDefault(); createHousehold() }} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">שם הבית</label>
                <input value={householdName} onChange={e => setHouseholdName(e.target.value)} className={inputCls} placeholder="הבית שלנו" />
              </div>
              <button type="submit" disabled={saving} className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold py-3 rounded-xl transition-colors duration-150">
                {saving ? 'יוצר...' : 'צור בית'}
              </button>
            </form>
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-zinc-100 dark:border-zinc-800" />
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">או</span>
              <div className="flex-1 border-t border-zinc-100 dark:border-zinc-800" />
            </div>
            <form onSubmit={e => { e.preventDefault(); joinHousehold() }} className="space-y-3">
              <input value={inviteCode} onChange={e => setInviteCode(e.target.value)} className={`${inputCls} uppercase tracking-[0.2em] text-center font-mono`} placeholder="קוד הזמנה" maxLength={6} />
              <button type="submit" disabled={saving || !inviteCode} className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 text-zinc-700 dark:text-zinc-300 text-sm font-semibold py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 transition-colors duration-150">
                הצטרף לבית
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Members */}
      {member?.households && members.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">בני הבית</p>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden mb-5">
            {members.map(m => (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-800/60 flex items-center justify-center text-violet-600 dark:text-violet-400 text-sm font-bold flex-shrink-0">
                  {(m.display_name[0] ?? '?').toUpperCase()}
                </div>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex-1">{m.display_name}</span>
                {m.user_id === user.id && <span className="text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full font-medium">אתה</span>}
                {m.role === 'admin' && m.user_id !== user.id && <span className="text-[10px] text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/40 border border-violet-100 dark:border-violet-800/60 px-2 py-0.5 rounded-full font-medium">מנהל</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Notifications */}
      {notifPermission !== null && (
        <>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">התראות</p>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">התראות למכשיר זה</span>
              {notifPermission === 'denied' ? (
                <span className="text-[11px] font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-2.5 py-1 rounded-full">חסומות</span>
              ) : notifPermission === 'granted' && pushSubscribed ? (
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-full">פעילות ✓</span>
              ) : (
                <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 rounded-full">לא פעילות</span>
              )}
            </div>

            {lastSentAt && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                נשלחה לאחרונה: {new Date(lastSentAt).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}
              </p>
            )}

            {notifPermission === 'denied' ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                התראות חסומות בדפדפן / במכשיר. שנה בהגדרות כדי להפעיל.
              </p>
            ) : notifPermission === 'granted' && pushSubscribed ? (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">מכשיר זה רשום לתזכורות</p>
                <button
                  onClick={handleUnsubscribePush}
                  disabled={pushActionLoading}
                  className="text-xs font-medium text-zinc-400 dark:text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors disabled:opacity-40"
                >
                  {pushActionLoading ? 'מעדכן...' : 'בטל מנוי'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleSubscribePush}
                disabled={pushActionLoading}
                className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors duration-150 active:scale-[0.99]"
              >
                {pushActionLoading ? 'מפעיל...' : 'הפעל התראות 🔔'}
              </button>
            )}
          </div>
        </>
      )}

      {/* Routines */}
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">שגרות</p>
      <div className="space-y-3 mb-5">
        {ROUTINE_TYPES.map(type => {
          const info = ROUTINE_INFO[type]
          const tasks = routineTasks[type]
          const active = routineActive[type]
          const isExpanded = expandedRoutine === type
          return (
            <div key={type} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <span className="text-xl">{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{info.label}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{info.description}</p>
                </div>
                {/* Active toggle */}
                <div
                  onClick={() => toggleRoutine(type, !active)}
                  className={`w-9 rounded-full flex items-center px-0.5 cursor-pointer flex-shrink-0 transition-colors duration-200 ${active ? 'bg-violet-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                  style={{ height: '20px' }}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${active ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </div>
              {/* Expand/collapse task editor */}
              {active && (
                <>
                  <button
                    onClick={() => setExpandedRoutine(isExpanded ? null : type)}
                    className="w-full flex items-center gap-2 px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    {isExpanded ? 'סגור עריכה' : `ערוך משימות (${tasks.filter(t => t.enabled).length} פעילות)`}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-2">
                      {/* Task list */}
                      {tasks.map(t => (
                        <div key={t.id} className="flex items-center gap-2.5">
                          <button
                            onClick={() => toggleTask(type, t.id)}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${t.enabled ? 'bg-violet-500 border-violet-500' : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600'}`}
                          >
                            {t.enabled && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>}
                          </button>
                          <span className="text-base">{t.icon}</span>
                          <span className={`flex-1 text-sm ${t.enabled ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-400 dark:text-zinc-600 line-through'}`}>{t.title}</span>
                          <button
                            onClick={() => removeTask(type, t.id)}
                            className="w-6 h-6 flex items-center justify-center text-zinc-300 dark:text-zinc-600 hover:text-rose-400 transition-colors duration-150 flex-shrink-0"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}

                      {/* Add custom task */}
                      <div className="flex gap-2 mt-3">
                        <input
                          type="text"
                          value={newTaskTitles[type]}
                          onChange={e => setNewTaskTitles(prev => ({ ...prev, [type]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask(type) } }}
                          placeholder="הוסף משימה..."
                          className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        />
                        <button
                          onClick={() => addTask(type)}
                          disabled={!newTaskTitles[type].trim()}
                          className="w-9 h-9 bg-violet-600 disabled:opacity-40 text-white rounded-xl flex items-center justify-center text-lg font-medium"
                        >+</button>
                      </div>

                      {/* Save / Reset */}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => saveRoutine(type)}
                          className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold py-2 rounded-xl transition-colors duration-150"
                        >
                          {routineSaved[type] ? '✓ נשמר' : 'שמור'}
                        </button>
                        <button
                          onClick={() => resetRoutine(type)}
                          className="px-3 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 transition-colors duration-150"
                        >
                          ברירת מחדל
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Danger zone */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
        {member?.households && (
          <button onClick={leaveHousehold} disabled={saving}
            className="w-full flex items-center gap-3 px-4 py-4 text-right hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors duration-150 group">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="text-rose-400 flex-shrink-0"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            <span className="text-sm font-medium text-rose-600 dark:text-rose-500">עזוב את הבית</span>
          </button>
        )}
        <button onClick={signOut}
          className="w-full flex items-center gap-3 px-4 py-4 text-right hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors duration-150">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="text-rose-400 flex-shrink-0"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          <span className="text-sm font-medium text-rose-600 dark:text-rose-500">התנתק</span>
        </button>
      </div>

    </div>
    </>
  )
}
