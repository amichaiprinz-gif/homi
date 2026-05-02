'use client'

import { useState, useRef } from 'react'
import BackButton from '@/components/BackButton'

interface MemoryEntry { key: string; value: string; updated_at: string }

export default function MemoryClient({ initial }: { initial: MemoryEntry[] }) {
  const [entries, setEntries] = useState<MemoryEntry[]>(initial)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Inline edit state: key → current draft value
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40 placeholder:text-zinc-400 transition-all duration-150'

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newKey.trim() || !newValue.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newKey.trim(), value: newValue.trim() }),
    })
    if (res.ok) {
      const now = new Date().toISOString()
      const newEntry: MemoryEntry = { key: newKey.trim(), value: newValue.trim(), updated_at: now }
      setEntries(prev => {
        const existing = prev.findIndex(e => e.key === newEntry.key)
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = newEntry
          return updated
        }
        return [newEntry, ...prev]
      })
      setNewKey('')
      setNewValue('')
    } else {
      setError('שגיאה בשמירה')
    }
    setSaving(false)
  }

  function startEdit(entry: MemoryEntry) {
    setEditingKey(entry.key)
    setEditDraft(entry.value)
    setTimeout(() => editInputRef.current?.focus(), 30)
  }

  async function commitEdit(key: string) {
    const draft = editDraft.trim()
    const original = entries.find(e => e.key === key)?.value ?? ''
    if (!draft || draft === original) { setEditingKey(null); return }
    setSavingEdit(true)
    const res = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: draft }),
    })
    if (res.ok) {
      setEntries(prev => prev.map(e => e.key === key ? { ...e, value: draft, updated_at: new Date().toISOString() } : e))
    }
    setSavingEdit(false)
    setEditingKey(null)
  }

  async function handleDelete(key: string) {
    const res = await fetch(`/api/memory?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
    if (res.ok) setEntries(prev => prev.filter(e => e.key !== key))
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-24" dir="rtl">
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="flex items-center gap-3 mb-6">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">זיכרון הבית 🧠</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">עובדות ששמרת לבוב</p>
          </div>
        </div>

        {/* Add form */}
        <form onSubmit={handleAdd} className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-sm border border-zinc-100 dark:border-zinc-800 mb-4 space-y-3">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">הוסף עובדה חדשה</p>
          <input
            className={inputCls}
            placeholder='מפתח — למשל "שרברב" או "שכר דירה"'
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder='ערך — למשל "מוטי 052-1234567"'
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={saving || !newKey.trim() || !newValue.trim()}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </form>

        {/* Memory list */}
        {entries.length === 0 ? (
          <div className="text-center py-16 text-zinc-400 dark:text-zinc-600">
            <div className="text-4xl mb-3">🧠</div>
            <p className="text-sm">אין עדיין עובדות שמורות</p>
            <p className="text-xs mt-1">אמור לבוב "תזכור ש..." בווטסאפ</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => (
              <div
                key={entry.key}
                className="bg-white dark:bg-zinc-900 rounded-2xl px-4 py-3 shadow-sm border border-zinc-100 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{entry.key}</p>

                    {editingKey === entry.key ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          ref={editInputRef}
                          value={editDraft}
                          onChange={e => setEditDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit(entry.key)
                            if (e.key === 'Escape') setEditingKey(null)
                          }}
                          className="flex-1 text-sm bg-zinc-50 dark:bg-zinc-800 border border-violet-300 dark:border-violet-600 text-zinc-900 dark:text-zinc-100 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800"
                          disabled={savingEdit}
                        />
                        <button
                          onClick={() => commitEdit(entry.key)}
                          disabled={savingEdit || !editDraft.trim()}
                          className="text-xs text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-2.5 py-1 rounded-lg font-medium transition-colors"
                        >
                          {savingEdit ? '...' : '✓'}
                        </button>
                        <button
                          onClick={() => setEditingKey(null)}
                          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(entry)}
                        className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed text-right w-full hover:text-violet-600 dark:hover:text-violet-400 transition-colors duration-150 group flex items-center gap-1.5"
                        title="לחץ לעריכה"
                      >
                        <span className="flex-1 text-right">{entry.value}</span>
                        <svg className="w-3 h-3 opacity-0 group-hover:opacity-60 flex-shrink-0 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a4 4 0 01-1.414.828l-3 1 1-3a4 4 0 01.828-1.414z" />
                        </svg>
                      </button>
                    )}

                    <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">{fmt(entry.updated_at)}</p>
                  </div>
                  {editingKey !== entry.key && (
                    <button
                      onClick={() => handleDelete(entry.key)}
                      className="text-zinc-300 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                      aria-label="מחק"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
