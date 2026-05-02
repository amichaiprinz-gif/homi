'use client'

import { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import BackButton from '@/components/BackButton'

const CATEGORY_HINT_MAP: Record<string, string> = {
  food: 'מזון',
  transport: 'תחבורה',
  health: 'בריאות',
  utilities: 'חשבונות',
  shopping: 'קניות',
  entertainment: 'בידור',
  education: 'חינוך',
  dining: 'מסעדות',
  home: 'בית',
  other: 'אחר',
}

interface Category {
  id: string
  name: string
  icon: string
  monthly_limit: number | null
}

interface Expense {
  id: string
  amount: number
  description: string
  expense_date: string
  category_id: string | null
  budget_categories: { name: string; icon: string } | null
}

async function api(body: Record<string, unknown>) {
  const res = await fetch('/api/budget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all duration-150'

export default function BudgetClient() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [prevMonthTotal, setPrevMonthTotal] = useState<number | null>(null)
  const [globalBudgetLimit, setGlobalBudgetLimit] = useState<number | null>(null)

  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])

  const [catName, setCatName] = useState('')
  const [catIcon, setCatIcon] = useState('💰')
  const [catLimit, setCatLimit] = useState('')

  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showSetLimit, setShowSetLimit] = useState(false)
  const [limitInput, setLimitInput] = useState('')
  const [savingLimit, setSavingLimit] = useState(false)

  // Paste-from-bank state
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsedItems, setParsedItems] = useState<{ date: string; amount: number; description: string; category_hint: string; category_id: string; selected: boolean }[]>([])
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => {
    fetch('/api/budget')
      .then(r => r.json())
      .then(d => {
        setExpenses(d.expenses ?? [])
        setCategories(d.categories ?? [])
        if (typeof d.prevMonthTotal === 'number') setPrevMonthTotal(d.prevMonthTotal)
        if (typeof d.budgetLimit === 'number') setGlobalBudgetLimit(d.budgetLimit)
      })
      .finally(() => setLoading(false))
  }, [])

  async function parseBankText() {
    if (!pasteText.trim()) return
    setParsing(true)
    try {
      const res = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse_text', text: pasteText }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      const items = (data.items ?? []).map((item: { date: string; amount: number; description: string; category_hint: string }) => {
        // Try to match hint to existing category by name
        const hintLabel = CATEGORY_HINT_MAP[item.category_hint] ?? ''
        const matched = categories.find(c => c.name === hintLabel || c.name.includes(hintLabel))
        return { ...item, category_id: matched?.id ?? '', selected: true }
      })
      setParsedItems(items)
    } catch {
      setError('שגיאה בניתוח')
    }
    setParsing(false)
  }

  async function saveParsedItems() {
    const toSave = parsedItems.filter(i => i.selected)
    if (!toSave.length) return
    setBulkSaving(true)
    const saved: Expense[] = []
    for (const item of toSave) {
      const data = await api({ action: 'add_expense', amount: item.amount, description: item.description, category_id: item.category_id || null, expense_date: item.date })
      if (!data.error) saved.push(data)
    }
    setExpenses(prev => [...saved, ...prev])
    setParsedItems([])
    setPasteText('')
    setShowPaste(false)
    setBulkSaving(false)
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || !description) return
    setSaving(true); setError('')
    const data = await api({ action: 'add_expense', amount, description, category_id: categoryId || null, expense_date: expenseDate })
    if (data.error) setError(data.error)
    else {
      setExpenses(prev => [data, ...prev])
      setAmount(''); setDescription(''); setCategoryId('')
      setExpenseDate(new Date().toISOString().split('T')[0])
      setShowAdd(false)
    }
    setSaving(false)
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!catName) return
    setSaving(true); setError('')
    const data = await api({ action: 'add_category', name: catName, icon: catIcon, monthly_limit: catLimit || null })
    if (data.error) setError(data.error)
    else {
      setCategories(prev => [...prev, data])
      setCatName(''); setCatIcon('💰'); setCatLimit('')
      setShowAddCat(false)
    }
    setSaving(false)
  }

  async function deleteExpense(id: string) {
    setExpenses(prev => prev.filter(e => e.id !== id))
    setConfirmDeleteId(null)
    await api({ action: 'delete_expense', id })
  }

  const total = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses])

  const byCategory = useMemo(() => {
    const map = new Map<string, { key: string; label: string; icon: string; amount: number; limit: number | null }>()
    for (const exp of expenses) {
      const key = exp.category_id ?? '__none__'
      const label = exp.budget_categories?.name ?? 'ללא קטגוריה'
      const icon = exp.budget_categories?.icon ?? '📋'
      const limit = categories.find(c => c.id === exp.category_id)?.monthly_limit ?? null
      const existing = map.get(key)
      if (existing) existing.amount += exp.amount
      else map.set(key, { key, label, icon, amount: exp.amount, limit })
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount)
  }, [expenses, categories])

  const filteredExpenses = catFilter ? expenses.filter(e => (e.category_id ?? '__none__') === catFilter) : expenses

  const totalLimit = useMemo(() => categories.reduce((sum, c) => sum + (c.monthly_limit ?? 0), 0), [categories])
  const maxCat = Math.max(...byCategory.map(c => c.amount), 1)
  const now = new Date()
  const monthLabel = MONTH_NAMES[now.getMonth()] + ' ' + now.getFullYear()

  return (
    <>
    {/* Paste from bank modal */}
    {showPaste && (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => !parsing && !bulkSaving && setShowPaste(false)}>
        <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl p-5 pb-10 shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">✨ הדבק מהבנק</p>
            <button onClick={() => setShowPaste(false)} disabled={parsing || bulkSaving} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {parsedItems.length === 0 ? (
            <>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={'הדבק כאן טקסט מאפליקציית הבנק, כרטיס האשראי (מקס, כאל, ישראכרט...):\n\nלדוגמה:\n01/04 רמי לוי 112.40\n02/04 פז דלק 180.00\n03/04 שופרסל 234.50'}
                rows={8}
                className={inputCls + ' resize-none text-xs'}
                autoFocus
              />
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 mb-4">
                הAI ינתח את הטקסט ויחלץ את ההוצאות אוטומטית
              </p>
              <button onClick={parseBankText} disabled={!pasteText.trim() || parsing}
                className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-semibold transition-colors duration-150">
                {parsing ? '🔍 מנתח...' : '🔍 נתח הוצאות'}
              </button>
            </>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">נמצאו {parsedItems.length} עסקאות — בחר אילו להוסיף:</p>
              <div className="overflow-y-auto flex-1 -mx-1 px-1 space-y-2 mb-4">
                {parsedItems.map((item, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors duration-150 ${item.selected ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/60' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 opacity-60'}`}>
                    <input type="checkbox" checked={item.selected}
                      onChange={() => setParsedItems(prev => prev.map((p, j) => j === i ? { ...p, selected: !p.selected } : p))}
                      className="w-4 h-4 accent-violet-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{item.description}</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{item.date}</p>
                    </div>
                    <select value={item.category_id}
                      onChange={e => setParsedItems(prev => prev.map((p, j) => j === i ? { ...p, category_id: e.target.value } : p))}
                      className="text-xs bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1 text-zinc-600 dark:text-zinc-300 max-w-[90px] flex-shrink-0">
                      <option value="">ללא</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums flex-shrink-0">
                      ₪{Number(item.amount).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setParsedItems([])} className="px-4 py-2.5 text-sm text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl transition-colors duration-150">
                  חזור
                </button>
                <button onClick={saveParsedItems} disabled={bulkSaving || !parsedItems.some(i => i.selected)}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150">
                  {bulkSaving ? 'שומר...' : `הוסף ${parsedItems.filter(i => i.selected).length} הוצאות`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    <div className="max-w-lg mx-auto px-4 pt-7 pb-nav page-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">תקציב</h1>
          <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPaste(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors duration-150"
            title="הדבק מהבנק ✨"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 12h6M9 16h4"/>
            </svg>
          </button>
          <BackButton />
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs px-4 py-3 rounded-2xl mb-4 text-center font-medium">{error}</div>
      )}

      {/* Donut chart card */}
      {!loading && (
        <BudgetDonut total={total} totalLimit={totalLimit} prevMonthTotal={prevMonthTotal} />
      )}

      {/* Global budget limit bar (set by Bob or here) */}
      {!loading && (
        globalBudgetLimit != null ? (
          <GlobalBudgetBar
            total={total}
            limit={globalBudgetLimit}
            daysLeft={new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()}
            onEdit={() => { setLimitInput(String(globalBudgetLimit)); setShowSetLimit(true) }}
          />
        ) : (
          <button
            onClick={() => { setLimitInput(''); setShowSetLimit(true) }}
            className="w-full mb-5 py-3 text-sm text-violet-600 dark:text-violet-400 border border-dashed border-violet-300 dark:border-violet-700 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors font-medium"
          >
            + הגדר תקציב חודשי
          </button>
        )
      )}

      {/* Set/edit global limit modal */}
      {showSetLimit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => !savingLimit && setShowSetLimit(false)}>
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl p-5 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">תקציב חודשי כולל</p>
            <input
              type="number"
              value={limitInput}
              onChange={e => setLimitInput(e.target.value)}
              placeholder="לדוגמה: 8000"
              className={inputCls}
              autoFocus
              min={0}
            />
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 mb-4">גם בוב יוכל לראות ולשנות ערך זה</p>
            <div className="flex gap-2">
              <button onClick={() => setShowSetLimit(false)} disabled={savingLimit}
                className="px-4 py-2.5 text-sm text-zinc-500 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl transition-colors">
                ביטול
              </button>
              <button
                onClick={async () => {
                  const val = Number(limitInput)
                  if (!val || val <= 0) return
                  setSavingLimit(true)
                  const res = await fetch('/api/memory', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'budget_limit', value: String(Math.round(val)) }),
                  })
                  if (res.ok) { setGlobalBudgetLimit(Math.round(val)); setShowSetLimit(false) }
                  setSavingLimit(false)
                }}
                disabled={savingLimit || !limitInput || Number(limitInput) <= 0}
                className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                {savingLimit ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add expense form */}
      {showAdd && (
        <form onSubmit={addExpense} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 mb-5 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">הוצאה חדשה</p>
            <button type="button" onClick={() => setShowAdd(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors duration-150 text-base leading-none">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input required value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="סכום (₪) *" type="number" min={0} step="0.01" className={inputCls} />
            <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className={inputCls} />
          </div>
          <input required value={description} onChange={e => setDescription(e.target.value)}
            placeholder="תיאור *" className={inputCls} />
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputCls}>
            <option value="">ללא קטגוריה</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150">
              {saving ? 'שומר...' : 'הוסף'}
            </button>
            <button type="button" onClick={() => setShowAddCat(!showAddCat)}
              className="px-3 bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 py-2.5 rounded-xl text-xs transition-colors duration-150 border border-zinc-200 dark:border-zinc-700">
              + קטגוריה
            </button>
          </div>
        </form>
      )}

      {/* Add category form */}
      {showAddCat && (
        <form onSubmit={addCategory} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 mb-5 space-y-2.5 shadow-sm">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">קטגוריה חדשה</p>
          <div className="grid grid-cols-3 gap-2">
            <input value={catIcon} onChange={e => setCatIcon(e.target.value)}
              placeholder="😀" className={inputCls + ' text-center text-lg'} maxLength={2} />
            <input required value={catName} onChange={e => setCatName(e.target.value)}
              placeholder="שם *" className={inputCls + ' col-span-2'} />
          </div>
          <input value={catLimit} onChange={e => setCatLimit(e.target.value)}
            placeholder="תקרה חודשית (₪)" type="number" min={0} className={inputCls} />
          <button type="submit" disabled={saving}
            className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 py-2.5 rounded-xl text-sm font-medium border border-zinc-200 dark:border-zinc-700 transition-colors duration-150">
            {saving ? 'שומר...' : 'צור קטגוריה'}
          </button>
        </form>
      )}

      {loading && <div className="text-center py-16 text-zinc-400 dark:text-zinc-500 text-sm">טוען...</div>}

      {/* Category breakdown */}
      {!loading && byCategory.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">לפי קטגוריה · לחץ לסינון</p>
          <div className="space-y-3.5">
            {byCategory.map(cat => {
              const limitPct = cat.limit ? Math.min((cat.amount / cat.limit) * 100, 100) : null
              const overBudget = cat.limit != null && cat.amount > cat.limit
              const nearBudget = cat.limit != null && !overBudget && cat.amount >= cat.limit * 0.8
              const barColor = overBudget ? 'bg-rose-500' : nearBudget ? 'bg-amber-400' : 'bg-violet-500'
              const isActive = catFilter === cat.key
              return (
                <button key={cat.key} onClick={() => setCatFilter(prev => prev === cat.key ? null : cat.key)}
                  className={`w-full text-right transition-opacity duration-150 ${catFilter && !isActive ? 'opacity-40' : 'opacity-100'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm flex items-center gap-1.5 ${isActive ? 'text-violet-700 dark:text-violet-400 font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}>
                      <span>{cat.icon}</span>{cat.label}
                      {isActive && <span className="text-[10px] text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-1.5 py-0.5 rounded-full border border-violet-200 dark:border-violet-800 font-medium">מסונן</span>}
                      {overBudget && !isActive && <span className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded-full border border-rose-200 dark:border-rose-800 font-medium">חרגת!</span>}
                      {nearBudget && !isActive && <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 font-medium">קרוב לתקרה</span>}
                    </span>
                    <div className="text-right">
                      <span className={`text-sm font-semibold tabular-nums ${overBudget ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                        ₪{cat.amount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                      {cat.limit && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mr-1">
                          / ₪{cat.limit.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${isActive ? 'bg-violet-500' : barColor}`}
                      style={{ width: `${limitPct !== null ? limitPct : (cat.amount / maxCat) * 100}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!loading && expenses.length === 0 && !showAdd && (
        <div className="text-center py-20">
          <p className="text-3xl mb-3">💰</p>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">אין הוצאות החודש</p>
          <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">לחץ + להוסיף הוצאה</p>
        </div>
      )}

      {/* Expenses list */}
      {expenses.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              הוצאות {catFilter && filteredExpenses.length !== expenses.length ? `(${filteredExpenses.length}/${expenses.length})` : ''}
            </p>
            {catFilter && (
              <button onClick={() => setCatFilter(null)} className="text-xs text-violet-500 hover:text-violet-700 font-medium transition-colors duration-150">
                ✕ הצג הכל
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {filteredExpenses.map(exp => (
              <div key={exp.id} className="flex items-center gap-3 px-4 py-3.5">
                <span className="text-base flex-shrink-0">{exp.budget_categories?.icon ?? '📋'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium truncate">{exp.description}</p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {exp.budget_categories?.name ?? 'ללא קטגוריה'} · {new Date(exp.expense_date + 'T00:00:00').toLocaleDateString('he-IL')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    ₪{Number(exp.amount).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                  {confirmDeleteId === exp.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setConfirmDeleteId(null)}
                        className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 font-medium px-1.5 py-1 rounded-lg transition-colors duration-150">
                        ביטול
                      </button>
                      <button onClick={() => deleteExpense(exp.id)}
                        className="text-[10px] text-white font-semibold bg-rose-500 hover:bg-rose-600 px-2 py-1 rounded-lg transition-colors duration-150">
                        מחק
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(exp.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors duration-150">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filteredExpenses.length === 0 && catFilter && (
              <div className="text-center py-8 text-zinc-400 dark:text-zinc-500 text-sm">אין הוצאות בקטגוריה זו</div>
            )}
          </div>
        </>
      )}

    </div>
    {/* FAB — outside page-in to avoid transform stacking context */}
    <button
      onClick={() => { setShowAdd(v => !v); setShowAddCat(false) }}
      className="fixed bottom-24 left-6 z-50 w-14 h-14 bg-violet-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl active:scale-95 transition-transform"
      aria-label={showAdd ? 'סגור' : 'הוסף הוצאה'}
    >
      {showAdd ? '×' : '+'}
    </button>
    </>
  )
}

function GlobalBudgetBar({ total, limit, daysLeft, onEdit }: { total: number; limit: number; daysLeft: number; onEdit: () => void }) {
  const pct = Math.min(Math.round((total / limit) * 100), 100)
  const over = total > limit
  const today = new Date().getDate()
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const projectedTotal = today > 0 ? Math.round((total / today) * daysInMonth) : total
  const onTrack = projectedTotal <= limit

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3.5 mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">תקציב חודשי כולל</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold tabular-nums ${over ? 'text-rose-500' : 'text-zinc-700 dark:text-zinc-200'}`}>
            ₪{Math.round(total).toLocaleString('he-IL')} / ₪{limit.toLocaleString('he-IL')}
          </span>
          <button onClick={onEdit} className="text-zinc-300 dark:text-zinc-600 hover:text-violet-500 transition-colors" aria-label="ערוך תקציב">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
        <span>{pct}% נוצל · עוד {daysLeft} ימים</span>
        <span className={onTrack ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>
          {onTrack ? `✓ בקצב טוב` : `⚠ צפי: ₪${projectedTotal.toLocaleString('he-IL')}`}
        </span>
      </div>
    </div>
  )
}

function BudgetDonut({ total, totalLimit, prevMonthTotal }: { total: number; totalLimit: number; prevMonthTotal: number | null }) {
  const overBudget = totalLimit > 0 && total > totalLimit
  const remaining = totalLimit > 0 ? Math.max(totalLimit - total, 0) : 0
  const overAmount = totalLimit > 0 ? Math.max(total - totalLimit, 0) : 0

  const chartData = total === 0 && totalLimit === 0
    ? [{ name: 'empty', value: 1, color: '#e4e4e7' }]
    : totalLimit > 0
      ? [
          { name: 'הוצאות', value: Math.min(total, totalLimit), color: '#e11d48' },
          ...(overBudget
            ? [{ name: 'חריגה', value: overAmount, color: '#9f1239' }]
            : [{ name: 'נותר', value: remaining, color: '#7c3aed' }]
          ),
        ]
      : [{ name: 'הוצאות', value: total || 1, color: total > 0 ? '#e11d48' : '#e4e4e7' }]

  const pct = totalLimit > 0 ? Math.round((total / totalLimit) * 100) : null

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mb-5">
      <div className="relative" style={{ height: 176 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={76}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-1">סה"כ</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums leading-none">
            ₪{Math.round(total).toLocaleString('he-IL')}
          </p>
          {pct !== null && (
            <p className={`text-xs font-medium mt-1.5 ${overBudget ? 'text-rose-500' : 'text-zinc-400 dark:text-zinc-500'}`}>
              {pct}% מהתקציב
            </p>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-0" dir="rtl">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#e11d48' }} />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">הוצאות</span>
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tabular-nums mr-1">
            ₪{Math.round(total).toLocaleString('he-IL')}
          </span>
        </div>
        {totalLimit > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: overBudget ? '#9f1239' : '#7c3aed' }} />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{overBudget ? 'חריגה' : 'נותר'}</span>
            <span className={`text-xs font-bold tabular-nums mr-1 ${overBudget ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
              ₪{Math.abs(totalLimit - total).toLocaleString('he-IL')}
            </span>
          </div>
        )}
      </div>

      {/* Month comparison */}
      {prevMonthTotal != null && prevMonthTotal > 0 && (
        <p className={`text-xs text-center mt-3 font-medium ${total > prevMonthTotal ? 'text-rose-500' : 'text-emerald-600'}`}>
          {total > prevMonthTotal ? '▲' : '▼'} ₪{Math.abs(total - prevMonthTotal).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} לעומת חודש קודם
        </p>
      )}
    </div>
  )
}
