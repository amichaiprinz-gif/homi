'use client'

import { useState, useEffect, useMemo } from 'react'
import BackButton from '@/components/BackButton'
import { Task, TaskCategory, FrequencyUnit, formatSchedule, formatFrequency, getTaskStatus, getStatusColor } from '@/types'

interface Member { user_id: string; display_name: string }
interface Props { tasks: Task[]; userId: string; members: Member[] }

const CATEGORIES: { value: TaskCategory; label: string; icon: string }[] = [
  { value: 'cleaning', label: 'ניקיון', icon: '🧹' },
  { value: 'laundry', label: 'כביסה', icon: '👕' },
  { value: 'plants', label: 'צמחים', icon: '🌿' },
  { value: 'kitchen', label: 'מטבח', icon: '🍳' },
  { value: 'shopping', label: 'קניות', icon: '🛒' },
  { value: 'maintenance', label: 'תחזוקה', icon: '🔧' },
  { value: 'other', label: 'אחר', icon: '📋' },
]

const FREQ_UNITS: { value: FrequencyUnit; label: string }[] = [
  { value: 'hours', label: 'שעות' },
  { value: 'days', label: 'ימים' },
  { value: 'weeks', label: 'שבועות' },
  { value: 'months', label: 'חודשים' },
]

// Sun=0 … Sat=6
const DAYS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

const NOTIFY_OPTIONS = [
  { value: 0, label: 'בזמן' },
  { value: 1, label: 'שעה לפני' },
  { value: 2, label: '2 שעות לפני' },
  { value: 4, label: '4 שעות לפני' },
  { value: 8, label: '8 שעות לפני' },
  { value: 24, label: 'יום לפני' },
]

const DEFAULT_TASKS = [
  { title: 'החלפת מצעים', category: 'laundry' as TaskCategory, icon: '🛏️', frequency_value: 3, frequency_unit: 'weeks' as FrequencyUnit },
  { title: 'השקיית צמחים', category: 'plants' as TaskCategory, icon: '🌿', frequency_value: 2, frequency_unit: 'days' as FrequencyUnit },
  { title: 'ריצפות', category: 'cleaning' as TaskCategory, icon: '🧹', frequency_value: 4, frequency_unit: 'days' as FrequencyUnit },
  { title: 'ניקוי שירותים', category: 'cleaning' as TaskCategory, icon: '🚽', frequency_value: 1, frequency_unit: 'weeks' as FrequencyUnit },
  { title: 'כביסה', category: 'laundry' as TaskCategory, icon: '👕', frequency_value: 4, frequency_unit: 'days' as FrequencyUnit },
]

type ScheduleType = 'recurring' | 'weekly' | 'one_time'

type FormState = {
  title: string
  description: string
  category: TaskCategory
  icon: string
  frequency_value: number
  frequency_unit: FrequencyUnit
  is_quick: boolean
  assigned_to: string
  points: number
  schedule_type: ScheduleType
  schedule_days: number[]
  schedule_time: string
  notify_before_hours: number
  due_date: string
}

const EMPTY: FormState = {
  title: '', description: '', category: 'cleaning', icon: '🧹',
  frequency_value: 7, frequency_unit: 'days',
  is_quick: false, assigned_to: '', points: 1,
  schedule_type: 'recurring', schedule_days: [], schedule_time: '08:00',
  notify_before_hours: 1, due_date: '',
}

async function apiTasks(body: Record<string, unknown>) {
  const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.json()
}

const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/30 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all duration-150'

export default function TasksClient({ tasks: initialTasks, userId, members }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [showAdd, setShowAdd] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [editForm, setEditForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [memberFilter, setMemberFilter] = useState<string | null>(null)
  const memberMap = useMemo(() => new Map(members.map(m => [m.user_id, m.display_name])), [members])

  const filteredTasks = useMemo(() => {
    if (!memberFilter) return tasks
    if (memberFilter === '__mine__') return tasks.filter(t => t.assigned_to === userId || !t.assigned_to)
    return tasks.filter(t => t.assigned_to === memberFilter)
  }, [tasks, memberFilter, userId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowAdd(false); setEditingTask(null); setConfirmDeleteId(null) } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function addTask(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const data = await apiTasks({ action: 'add', ...form })
    if (data.error) setError(data.error)
    else { setTasks(prev => [data, ...prev]); setShowAdd(false); setForm(EMPTY) }
    setSaving(false)
  }

  function startEdit(task: Task) {
    setEditingTask(task)
    setEditForm({
      title: task.title,
      description: task.description ?? '',
      category: task.category,
      icon: task.icon,
      frequency_value: task.frequency_value,
      frequency_unit: task.frequency_unit,
      is_quick: task.is_quick ?? false,
      assigned_to: task.assigned_to ?? '',
      points: task.points ?? 1,
      schedule_type: task.schedule_type ?? 'recurring',
      schedule_days: task.schedule_days ?? [],
      schedule_time: task.schedule_time ?? '08:00',
      notify_before_hours: task.notify_before_hours ?? 1,
      due_date: '',
    })
    setShowAdd(false)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editingTask) return
    setSaving(true); setError('')
    const data = await apiTasks({ action: 'update', id: editingTask.id, ...editForm, last_done_at: editingTask.last_done_at, previous_assigned_to: editingTask.assigned_to ?? null })
    if (data.error) setError(data.error)
    else { setTasks(prev => prev.map(t => t.id === data.id ? data : t)); setEditingTask(null) }
    setSaving(false)
  }

  async function deleteTask(id: string) {
    const data = await apiTasks({ action: 'delete', id })
    if (data.error) { setError(data.error); return }
    setTasks(prev => prev.filter(t => t.id !== id))
    if (editingTask?.id === id) setEditingTask(null)
    setConfirmDeleteId(null)
  }

  async function addDefaultTask(preset: typeof DEFAULT_TASKS[0]) {
    setSaving(true)
    const data = await apiTasks({ action: 'add', ...preset, assigned_to: '', points: 1, schedule_type: 'recurring', schedule_days: [], schedule_time: '08:00', notify_before_hours: 1 })
    if (!data.error) setTasks(prev => [data, ...prev])
    setSaving(false)
  }

  const availableDefaults = !showAdd && !editingTask ? DEFAULT_TASKS.filter(p => !tasks.some(t => t.title === p.title)) : []

  return (
    <>
    <div className="max-w-lg mx-auto px-4 pt-7 pb-nav page-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">משימות</h1>
        <BackButton />
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-3 py-2.5 rounded-xl mb-4 text-center">{error}</div>
      )}

      {/* Add form */}
      {showAdd && (
        <TaskForm form={form} setForm={setForm} onSubmit={addTask} saving={saving} title="משימה חדשה" submitLabel="הוסף" onCancel={() => setShowAdd(false)} members={members} />
      )}

      {/* Edit form */}
      {editingTask && (
        <TaskForm form={editForm} setForm={setEditForm} onSubmit={saveEdit} saving={saving} title="עריכת משימה" submitLabel="שמור" onCancel={() => setEditingTask(null)} members={members} />
      )}

      {/* Member filter chips */}
      {members.length > 1 && !showAdd && !editingTask && (
        <div className="flex gap-1.5 flex-wrap mb-5 -mt-1">
          {[
            { id: null, label: 'הכל' },
            { id: '__mine__', label: 'שלי' },
            ...members.map(m => ({ id: m.user_id, label: m.display_name })),
          ].map(chip => (
            <button
              key={chip.id ?? 'all'}
              onClick={() => setMemberFilter(prev => prev === chip.id ? null : chip.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors duration-150 ${
                memberFilter === chip.id
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-violet-300 hover:text-violet-600'
              }`}
            >
              {chip.label}
              {chip.id !== null && (
                <span className="mr-1 text-[10px] opacity-70">
                  ({chip.id === '__mine__'
                    ? tasks.filter(t => t.assigned_to === userId || !t.assigned_to).length
                    : tasks.filter(t => t.assigned_to === chip.id).length})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Suggested defaults */}
      {availableDefaults.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">מוצע</p>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {availableDefaults.map(preset => (
              <button key={preset.title} onClick={() => addDefaultTask(preset)} disabled={saving}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-right hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150 active:bg-zinc-100 dark:active:bg-zinc-700">
                <span className="text-xl w-9 h-9 bg-zinc-50 dark:bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0">{preset.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{preset.title}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{formatFrequency(preset.frequency_value, preset.frequency_unit)}</p>
                </div>
                <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-base font-medium flex-shrink-0">+</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Task list */}
      {filteredTasks.length === 0 && !showAdd && (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">📋</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
            {memberFilter ? 'אין משימות בסינון זה' : 'אין משימות עדיין'}
          </p>
          {!memberFilter && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">לחץ + להוספה</p>}
        </div>
      )}

      {filteredTasks.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
          {filteredTasks.map(task => {
            const status = getTaskStatus(task)
            const color = getStatusColor(status)
            const isEditing = editingTask?.id === task.id
            const schedLabel = task.schedule_type === 'one_time' ? 'חד פעמי' : formatSchedule(task)
            return (
              <div key={task.id} className={`flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 ${isEditing ? 'bg-violet-50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
                <div className="text-xl w-9 h-9 bg-zinc-50 dark:bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0 border border-zinc-100 dark:border-zinc-700">
                  {task.icon || '📋'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{task.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{schedLabel}</span>
                    {task.next_due_at && (
                      <><span className="text-zinc-300 dark:text-zinc-600 text-xs">·</span><span className={`text-xs font-medium ${color}`}>{new Date(task.next_due_at).toLocaleDateString('he-IL')}</span></>
                    )}
                    {task.assigned_to && (
                      <><span className="text-zinc-300 text-xs">·</span><span className="text-xs text-violet-500 font-medium">{memberMap.get(task.assigned_to) ?? 'מוקצה'}</span></>
                    )}
                  </div>
                </div>
                {confirmDeleteId === task.id ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors duration-150"
                    >ביטול</button>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-xs font-semibold text-white px-2.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 active:bg-rose-700 transition-colors duration-150"
                    >מחק</button>
                  </div>
                ) : (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => isEditing ? setEditingTask(null) : startEdit(task)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-150 ${isEditing ? 'bg-violet-100 text-violet-600' : 'text-zinc-400 hover:text-violet-600 hover:bg-violet-50'}`}
                    aria-label="ערוך"
                  >
                    {isEditing ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    )}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(task.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-colors duration-150"
                    aria-label="מחק"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                  </button>
                </div>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
    {/* FAB — outside page-in to avoid transform stacking context */}
    <button
      onClick={() => { setShowAdd(prev => !prev); setEditingTask(null) }}
      className="fixed bottom-24 left-6 z-50 w-14 h-14 bg-violet-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl active:scale-95 transition-transform"
      aria-label={showAdd ? 'סגור' : 'הוסף משימה'}
    >
      {showAdd ? '×' : '+'}
    </button>
    </>
  )
}

function TaskForm({ form, setForm, onSubmit, saving, title, submitLabel, onCancel, members }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; onSubmit: (e: React.FormEvent) => void
  saving: boolean; title: string; submitLabel: string; onCancel: () => void; members: Member[]
}) {
  function toggleDay(day: number) {
    setForm(f => ({
      ...f,
      schedule_days: f.schedule_days.includes(day)
        ? f.schedule_days.filter(d => d !== day)
        : [...f.schedule_days, day].sort((a, b) => a - b),
    }))
  }

  return (
    <form onSubmit={onSubmit} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
        <button type="button" onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <input type="text" placeholder="שם המשימה" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required className={inputCls} />

      <textarea
        placeholder="הערות (אופציונלי)"
        value={form.description}
        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        rows={2}
        className={`${inputCls} resize-none`}
      />

      {/* Category */}
      <div className="grid grid-cols-4 gap-1.5">
        {CATEGORIES.map(cat => (
          <button key={cat.value} type="button" onClick={() => setForm(f => ({ ...f, category: cat.value, icon: cat.icon }))}
            className={`flex flex-col items-center gap-0.5 py-2.5 rounded-xl text-xs border transition-colors duration-150 ${form.category === cat.value ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'}`}>
            <span className="text-base">{cat.icon}</span>
            <span className="text-[9px] font-medium">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Quick task toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => setForm(f => ({ ...f, is_quick: !f.is_quick }))}
          className={`w-9 rounded-full transition-colors duration-200 flex items-center px-0.5 cursor-pointer flex-shrink-0 ${form.is_quick ? 'bg-violet-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}
          style={{ height: '20px' }}
        >
          <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${form.is_quick ? 'translate-x-4' : 'translate-x-0'}`} />
        </div>
        <div>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">משימה מהירה</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 mr-1.5">— ניתן לבצע כמה פעמים</span>
        </div>
      </label>

      {/* Schedule type — only for non-quick tasks */}
      {!form.is_quick && (
        <>
          <div className="flex gap-1.5">
            {([
              { value: 'recurring', label: 'חוזר' },
              { value: 'weekly', label: 'ימים קבועים' },
              { value: 'one_time', label: 'חד פעמי' },
            ] as { value: ScheduleType; label: string }[]).map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setForm(f => ({ ...f, schedule_type: opt.value }))}
                className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors duration-150 ${form.schedule_type === opt.value ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'}`}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Recurring: frequency picker */}
          {form.schedule_type === 'recurring' && (
            <div className="flex gap-2 items-center">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm flex-shrink-0">כל</span>
              <input type="number" min={1} max={365} value={form.frequency_value} onChange={e => setForm(f => ({ ...f, frequency_value: Number(e.target.value) }))}
                className="w-16 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 text-center transition-all duration-150" />
              <select value={form.frequency_unit} onChange={e => setForm(f => ({ ...f, frequency_unit: e.target.value as FrequencyUnit }))}
                className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 transition-all duration-150">
                {FREQ_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          )}

          {/* Weekly: day-of-week picker + time */}
          {form.schedule_type === 'weekly' && (
            <div className="space-y-2.5">
              <div className="flex gap-1 justify-between">
                {DAYS_HE.map((label, dayIdx) => (
                  <button key={dayIdx} type="button" onClick={() => toggleDay(dayIdx)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors duration-150 ${form.schedule_days.includes(dayIdx) ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 dark:text-zinc-400 text-sm flex-shrink-0">בשעה</span>
                <input type="time" value={form.schedule_time}
                  onChange={e => setForm(f => ({ ...f, schedule_time: e.target.value }))}
                  className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 transition-all duration-150" />
              </div>
            </div>
          )}

          {/* One-time: optional due date */}
          {form.schedule_type === 'one_time' && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm flex-shrink-0">תאריך יעד</span>
              <input type="date" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 transition-all duration-150" />
            </div>
          )}
        </>
      )}

      {/* Points */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">נקודות</span>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" onClick={() => setForm(f => ({ ...f, points: n }))}
            className={`w-8 h-8 rounded-lg text-xs font-semibold border transition-colors duration-150 ${form.points === n ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'}`}>
            {n}
          </button>
        ))}
      </div>

      {/* Assignment */}
      {members.length > 0 && (
        <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
          className={inputCls}>
          <option value="">לא מוקצה — כולם מקבלים התראה</option>
          {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name} — רק הוא מקבל התראה</option>)}
        </select>
      )}

      {/* Notify before (only for assigned + non-quick) */}
      {form.assigned_to && !form.is_quick && (
        <select value={form.notify_before_hours} onChange={e => setForm(f => ({ ...f, notify_before_hours: Number(e.target.value) }))}
          className={inputCls}>
          {NOTIFY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}

      <button type="submit" disabled={saving || (form.schedule_type === 'weekly' && form.schedule_days.length === 0 && !form.is_quick)}
        className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors duration-150 active:scale-[0.99]">
        {saving ? 'שומר...' : submitLabel}
      </button>
    </form>
  )
}
