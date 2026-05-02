'use client'

import { useState, useEffect } from 'react'
import BackButton from '@/components/BackButton'

interface Provider {
  id: string
  name: string
  profession: string
  phone: string | null
  notes: string | null
  last_used: string | null
  last_cost: number | null
  rating: number | null
}

type ProviderForm = {
  name: string
  profession: string
  phone: string
  notes: string
  last_used: string
  last_cost: string
  rating: string
}

const EMPTY_FORM: ProviderForm = { name: '', profession: '', phone: '', notes: '', last_used: '', last_cost: '', rating: '' }
const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all duration-150'

async function api(body: Record<string, unknown>) {
  const res = await fetch('/api/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export default function ProvidersClient() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/providers')
      .then(r => r.json())
      .then(d => Array.isArray(d) && setProviders(d))
      .finally(() => setLoading(false))
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const action = editingId ? 'update' : 'add'
    const data = await api({ action, id: editingId, ...form })
    if (!data.error) {
      if (editingId) {
        setProviders(prev => prev.map(p => p.id === editingId ? data : p))
        setEditingId(null)
      } else {
        setProviders(prev => [data, ...prev])
        setShowAdd(false)
      }
      setForm(EMPTY_FORM)
    }
    setSaving(false)
  }

  function startEdit(p: Provider) {
    setEditingId(p.id)
    setForm({
      name: p.name, profession: p.profession, phone: p.phone ?? '',
      notes: p.notes ?? '', last_used: p.last_used ?? '',
      last_cost: p.last_cost?.toString() ?? '', rating: p.rating?.toString() ?? '',
    })
    setShowAdd(false)
    setExpandedId(null)
  }

  async function remove(id: string) {
    setProviders(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
    await api({ action: 'delete', id })
  }

  const formVisible = showAdd || !!editingId

  return (
    <>
    <div className="max-w-lg mx-auto px-4 pt-7 pb-nav page-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">ספקי שירותים</h1>
        <BackButton />
      </div>

      {/* Add/Edit form */}
      {formVisible && (
        <form onSubmit={save} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 mb-5 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{editingId ? 'עריכת ספק' : 'ספק חדש'}</p>
            <button type="button" onClick={() => { setShowAdd(false); setEditingId(null); setForm(EMPTY_FORM) }}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors duration-150 text-base leading-none">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="שם *" className={inputCls} />
            <input required value={form.profession} onChange={e => setForm(f => ({ ...f, profession: e.target.value }))}
              placeholder="מקצוע *" className={inputCls} />
          </div>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="טלפון" type="tel" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.last_used} onChange={e => setForm(f => ({ ...f, last_used: e.target.value }))}
              placeholder="תאריך שימוש אחרון" type="date" className={inputCls} />
            <input value={form.last_cost} onChange={e => setForm(f => ({ ...f, last_cost: e.target.value }))}
              placeholder="עלות אחרונה (₪)" type="number" min={0} className={inputCls} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">דירוג</span>
            {[1,2,3,4,5].map(n => (
              <button key={n} type="button"
                onClick={() => setForm(f => ({ ...f, rating: f.rating === n.toString() ? '' : n.toString() }))}
                className={`text-base transition-opacity duration-150 ${Number(form.rating) >= n ? 'opacity-100' : 'opacity-25 hover:opacity-60'}`}>
                ⭐
              </button>
            ))}
          </div>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="הערות" rows={2} className={inputCls + ' resize-none'} />
          <button type="submit" disabled={saving}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150">
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </form>
      )}

      {loading && <div className="text-center py-16 text-zinc-400 dark:text-zinc-500 text-sm">טוען...</div>}

      {!loading && providers.length === 0 && !formVisible && (
        <div className="text-center py-20">
          <p className="text-3xl mb-3">🔧</p>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">אין ספקים עדיין</p>
          <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">לחץ + להוסיף</p>
        </div>
      )}

      {providers.length > 3 && (
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם או מקצוע..."
          className={inputCls + ' mb-4'}
        />
      )}

      {providers.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
          {providers.filter(p => !search.trim() || p.name.includes(search) || p.profession.includes(search)).map(p => {
            const expanded = expandedId === p.id
            return (
              <div key={p.id}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-right hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150"
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                >
                  <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-800/60 flex items-center justify-center text-violet-600 dark:text-violet-400 text-sm flex-shrink-0 font-semibold">
                    {(p.profession[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{p.name}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">{p.profession}</p>
                  </div>
                  {p.rating && (
                    <span className="flex-shrink-0 text-[11px]">{'⭐'.repeat(p.rating)}</span>
                  )}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`text-zinc-300 dark:text-zinc-600 flex-shrink-0 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {expanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-2.5">
                    <div className="pt-3">
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 transition-colors duration-150 mb-2">
                          <span>📞</span> {p.phone}
                        </a>
                      )}
                      {p.last_used && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">שימוש אחרון: {new Date(p.last_used).toLocaleDateString('he-IL')}</p>
                      )}
                      {p.last_cost != null && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">עלות אחרונה: ₪{p.last_cost.toLocaleString('he-IL')}</p>
                      )}
                      {p.notes && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 mt-2">{p.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <button onClick={() => startEdit(p)}
                        className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 font-medium transition-colors duration-150">
                        עריכה
                      </button>
                      <span className="text-zinc-300 dark:text-zinc-600">·</span>
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(p.name + ' ' + p.profession)}+site:madreg.co.il`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-violet-500 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium transition-colors duration-150"
                      >
                        מדרג 🔍
                      </a>
                      <span className="text-zinc-300 dark:text-zinc-600">·</span>
                      {confirmDeleteId === p.id ? (
                        <span className="flex items-center gap-1">
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-zinc-400 hover:text-zinc-600 font-medium transition-colors duration-150">ביטול</button>
                          <button onClick={() => remove(p.id)}
                            className="text-xs text-white font-semibold bg-rose-500 hover:bg-rose-600 px-2 py-0.5 rounded-lg transition-colors duration-150">מחק</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(p.id)}
                          className="text-xs text-rose-400 hover:text-rose-600 font-medium transition-colors duration-150">
                          מחק
                        </button>
                      )}
                    </div>
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
      onClick={() => { setShowAdd(v => !v); setEditingId(null); setForm(EMPTY_FORM) }}
      className="fixed bottom-24 left-6 z-50 w-14 h-14 bg-violet-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl active:scale-95 transition-transform"
      aria-label={showAdd ? 'סגור' : 'הוסף ספק'}
    >
      {showAdd ? '×' : '+'}
    </button>
    </>
  )
}
