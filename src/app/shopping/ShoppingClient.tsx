'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import BackButton from '@/components/BackButton'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { forceRegisterPush } from '@/components/PushInitializer'
import type { PreparedOrder, OrderLine } from '@/lib/supermarket/types'

// Use dynamic import (ssr: false) so the modal is never part of the SSR render tree,
// preventing any potential hydration mismatch from its inline styles / client-only logic.
const CartBuilderModal = dynamic(() => import('./CartBuilderModal'), { ssr: false })

interface ShoppingItem {
  id: string
  text: string
  done: boolean
  quantity: string | null
  note: string | null
  category: string | null
}

interface Props {
  initialItems: ShoppingItem[]
  initialHouseholdId: string | null
  initialShoppingMode: boolean
}

type EditForm = { text: string; quantity: string; note: string }

const AISLE_ORDER = [
  'ירקות ופירות', 'מוצרי חלב', 'בשר ודגים', 'מאפייה',
  'קפואים', 'מזווה', 'ניקיון', 'היגיינה', 'כללי',
]

const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all duration-150'

function groupByAisle(items: ShoppingItem[]): Map<string, ShoppingItem[]> {
  const map = new Map<string, ShoppingItem[]>()
  for (const item of items) {
    const key = item.category?.trim() || 'כללי'
    const arr = map.get(key) ?? []
    arr.push(item)
    map.set(key, arr)
  }
  const sorted = new Map<string, ShoppingItem[]>()
  for (const aisle of AISLE_ORDER) {
    if (map.has(aisle)) sorted.set(aisle, map.get(aisle)!)
  }
  for (const [k, v] of map) {
    if (!sorted.has(k)) sorted.set(k, v)
  }
  return sorted
}

export default function ShoppingClient({ initialItems, initialHouseholdId, initialShoppingMode }: Props) {
  const [items, setItems] = useState<ShoppingItem[]>(initialItems)
  const [text, setText] = useState('')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ text: '', quantity: '', note: '' })
  const [showAddForm, setShowAddForm] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ShoppingItem | null>(null)
  const [pendingClear, setPendingClear] = useState<ShoppingItem[]>([])
  const [addError, setAddError] = useState('')
  const [shoppingAlertSent, setShoppingAlertSent] = useState(false)
  const [shoppingAlertLoading, setShoppingAlertLoading] = useState(false)
  const [shoppingAlertResult, setShoppingAlertResult] = useState<string | null>(null)
  const [supermarketMode, setSupermarketMode] = useState(initialShoppingMode)
  const [householdId, setHouseholdId] = useState<string | null>(initialHouseholdId)
  const [pasteModal, setPasteModal] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteLoading, setPasteLoading] = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(null)
  const [testPushStatus, setTestPushStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle')
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderResult, setOrderResult] = useState<PreparedOrder | null>(null)
  const [orderError, setOrderError] = useState('')
  const [showCartBuilder, setShowCartBuilder] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [historyList, setHistoryList] = useState<{ id: string; created_at: string; items: { text: string; quantity: string | null }[] }[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs tracking IDs that are pending undo — realtime re-fetches must filter these out
  // to avoid overwriting optimistic removals or causing duplicates on undo.
  const pendingDeleteIdRef = useRef<string | null>(null)
  const pendingClearIdsRef = useRef<Set<string>>(new Set())
  // Single stable Supabase client for the lifetime of this component
  const supabase = useRef(createClient()).current
  // Reference to the household broadcast channel so we can send from event handlers
  const householdChannelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    }
  }, [])

  // Check notification permission on mount (SSR-safe)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  // Initial data is now server-rendered via props — no fetch on mount needed.

  // ── Realtime: shopping_items ───────────────────────────────────────────────
  // Re-fetches the list whenever any item changes (insert/update/delete).
  useEffect(() => {
    const channel = supabase
      .channel('shopping-items-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, () => {
        fetch('/api/shopping')
          .then(r => r.json())
          .then(data => {
            if (Array.isArray(data)) {
              // Filter out items that are in an undo window — prevents realtime from
              // overwriting optimistic removals and causing duplicates on undo.
              const pendingId = pendingDeleteIdRef.current
              const pendingClearIds = pendingClearIdsRef.current
              setItems(data.filter((item: ShoppingItem) => {
                if (pendingId && item.id === pendingId) return false
                if (pendingClearIds.size > 0 && pendingClearIds.has(item.id)) return false
                return true
              }))
            }
          })
      })
      .subscribe(status => {
        console.log('[Realtime] shopping_items:', status)
      })
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // ── Realtime: household shopping mode ─────────────────────────────────────
  // TWO mechanisms on the same channel:
  //   1. Broadcast  — zero-config, instant (works immediately, no SQL needed)
  //   2. postgres_changes — DB-driven fallback (requires households in publication)
  // When Device A activates shopping mode, it broadcasts AND writes to DB.
  // Device B receives the broadcast and updates instantly.
  useEffect(() => {
    if (!householdId) return

    const channelName = `household-shopping-${householdId}`
    console.log('[Realtime] Subscribing to channel:', channelName)

    const channel = supabase
      .channel(channelName)
      // ── Mechanism 1: Broadcast (works without any Supabase SQL config) ──
      .on('broadcast', { event: 'shopping_mode' }, msg => {
        const active = msg.payload?.active
        console.log('REALTIME_EVENT: Household state changed to', active, '(broadcast)')
        if (typeof active === 'boolean') setSupermarketMode(active)
      })
      // ── Mechanism 2: postgres_changes (fires once SQL migration is run) ──
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'households' },
        payload => {
          const row = payload.new as Record<string, unknown>
          if (row.id !== householdId) return // client-side filter
          const active = row.shopping_active
          console.log('REALTIME_EVENT: Household state changed to', active, '(postgres_changes)')
          if (typeof active === 'boolean') setSupermarketMode(active)
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Household channel status:', status, err ?? '')
      })

    householdChannelRef.current = channel
    return () => {
      householdChannelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [householdId, supabase])

  // ── Helper: broadcast + DB write for mode changes ─────────────────────────
  async function setShoppingMode(active: boolean) {
    // 1. Broadcast instantly to all connected household members (no DB needed)
    if (householdChannelRef.current) {
      householdChannelRef.current.send({
        type: 'broadcast',
        event: 'shopping_mode',
        payload: { active },
      }).catch(e => console.error('[Broadcast] Send failed:', e))
    }
    // 2. Update sender's own UI (senders don't receive their own broadcasts)
    setSupermarketMode(active)
    // 3. Persist to DB (for persistence + postgres_changes fallback)
    await fetch('/api/shopping/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
  }

  async function handleEnablePush() {
    await forceRegisterPush()
    // Re-read the permission state so the banner dismisses on success
    if ('Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }

  async function sendTestPush() {
    if (testPushStatus === 'sending') return
    setTestPushStatus('sending')
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const data = await res.json()
      console.log('PUSH_DEBUG: Test push result:', data)
      setTestPushStatus(data.ok ? 'ok' : 'fail')
    } catch (err) {
      console.error('PUSH_DEBUG: Test push request failed:', err)
      setTestPushStatus('fail')
    }
    setTimeout(() => setTestPushStatus('idle'), 5000)
  }

  // ── Item actions ──────────────────────────────────────────────────────────
  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return

    const tempId = `temp-${Date.now()}`
    const tempItem: ShoppingItem = {
      id: tempId, text: text.trim(), done: false,
      quantity: quantity.trim() || null, note: note.trim() || null, category: category || null,
    }
    setItems(prev => [tempItem, ...prev])
    setText(''); setQuantity(''); setNote(''); setCategory(''); setShowAddForm(false)

    try {
      const res = await fetch('/api/shopping', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', text: tempItem.text, quantity: tempItem.quantity, note: tempItem.note, category: tempItem.category }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItems(prev => prev.map(i => i.id === tempId ? data : i))
    } catch {
      setItems(prev => prev.filter(i => i.id !== tempId))
      setText(tempItem.text); setQuantity(tempItem.quantity ?? ''); setNote(tempItem.note ?? '')
      setShowAddForm(true)
      setAddError('שגיאה בהוספת הפריט — נסה שוב')
      setTimeout(() => setAddError(''), 3000)
    }
  }

  async function parsePaste() {
    if (!pasteText.trim() || pasteLoading) return
    setPasteLoading(true)
    try {
      const res = await fetch('/api/ai/parse-shopping-list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      })
      const data = await res.json()
      const parsed: Array<{ name: string; quantity: string; category: string }> =
        Array.isArray(data.items) ? data.items : []
      if (!parsed.length) { setPasteLoading(false); return }

      const tempItems: ShoppingItem[] = parsed.map((p, idx) => ({
        id: `temp-${Date.now()}-${idx}`,
        text: p.name, done: false,
        quantity: p.quantity || null, note: null,
        category: p.category || 'כללי',
      }))
      setItems(prev => [...tempItems, ...prev])
      setPasteText('')
      setPasteModal(false)

      await Promise.all(
        tempItems.map((t, idx) =>
          fetch('/api/shopping', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', text: t.text, quantity: t.quantity, category: parsed[idx].category }),
          })
            .then(r => r.json())
            .then(saved => { if (!saved.error) setItems(prev => prev.map(i => i.id === t.id ? saved : i)) })
            .catch(() => setItems(prev => prev.filter(i => i.id !== t.id)))
        )
      )
    } catch {
      setAddError('שגיאה בניתוח הטקסט — נסה שוב')
      setTimeout(() => setAddError(''), 3000)
    }
    setPasteLoading(false)
  }

  async function saveEdit(id: string) {
    const res = await fetch('/api/shopping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'edit', id, ...editForm }),
    })
    const data = await res.json()
    if (!data.error) { setItems(prev => prev.map(i => i.id === id ? data : i)); setEditingId(null) }
  }

  async function toggleItem(item: ShoppingItem) {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, done: !i.done } : i))
    const res = await fetch('/api/shopping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', id: item.id, done: !item.done }),
    })
    const data = await res.json()
    if (data.error) setItems(prev => prev.map(i => i.id === item.id ? item : i))
  }

  function deleteItem(id: string) {
    const item = items.find(i => i.id === id)
    if (!item) return

    // If there's already a pending delete, commit it immediately before starting a new one.
    // Without this, the previous item would be cancelled and never deleted from DB.
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current)
      const prevId = pendingDeleteIdRef.current
      if (prevId) {
        fetch('/api/shopping', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', id: prevId }),
        }).catch(() => {})
      }
    }

    setItems(prev => prev.filter(i => i.id !== id))
    setPendingDelete(item)
    pendingDeleteIdRef.current = id
    deleteTimerRef.current = setTimeout(async () => {
      setPendingDelete(null)
      pendingDeleteIdRef.current = null
      await fetch('/api/shopping', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      })
    }, 4000)
  }

  function undoDelete() {
    if (!pendingDelete) return
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    pendingDeleteIdRef.current = null
    setItems(prev => [pendingDelete, ...prev])
    setPendingDelete(null)
  }

  function clearDone() {
    const doneItems = items.filter(i => i.done)
    if (!doneItems.length) return
    setItems(prev => prev.filter(i => !i.done))
    setPendingClear(doneItems)
    pendingClearIdsRef.current = new Set(doneItems.map(i => i.id))
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    clearTimerRef.current = setTimeout(async () => {
      setPendingClear([])
      try {
        await fetch('/api/shopping', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear_done' }),
        })
      } finally {
        // Clear only AFTER the API call completes so the realtime re-fetch
        // triggered by the deletion doesn't temporarily restore the items.
        pendingClearIdsRef.current = new Set()
      }
    }, 5000)
  }

  function undoClear() {
    if (!pendingClear.length) return
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    pendingClearIdsRef.current = new Set()
    setItems(prev => [...pendingClear, ...prev])
    setPendingClear([])
  }

  function startEdit(item: ShoppingItem) {
    setEditingId(item.id)
    setEditForm({ text: item.text, quantity: item.quantity ?? '', note: item.note ?? '' })
  }

  async function prepareOrder() {
    if (orderLoading) return
    setOrderLoading(true)
    setOrderError('')
    setOrderResult(null)
    try {
      const res = await fetch('/api/shopping/prepare-order', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) {
        setOrderError(data.error ?? 'שגיאה בהכנת ההזמנה')
        setTimeout(() => setOrderError(''), 5000)
      } else {
        setOrderResult(data as PreparedOrder)
      }
    } catch {
      setOrderError('שגיאת רשת — נסה שוב')
      setTimeout(() => setOrderError(''), 5000)
    }
    setOrderLoading(false)
  }

  async function openHistory() {
    setShowHistory(true)
    if (historyList.length > 0) return // already loaded
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/shopping/history')
      const data = await res.json()
      if (Array.isArray(data)) setHistoryList(data)
    } catch { /* ignore */ }
    setHistoryLoading(false)
  }

  async function restoreHistory(entry: { id: string; items: { text: string; quantity: string | null }[] }) {
    for (const item of entry.items) {
      await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', text: item.text, quantity: item.quantity }),
      })
    }
    setShowHistory(false)
    // Re-fetch items after restore
    const res = await fetch('/api/shopping')
    const data = await res.json()
    if (Array.isArray(data)) setItems(data)
  }

  async function deleteHistory(id: string) {
    setHistoryList(prev => prev.filter(h => h.id !== id))
    await fetch('/api/shopping/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
  }

  function shareOnWhatsApp() {
    const lines = items.filter(i => !i.done).map(i =>
      `• ${i.text}${i.quantity ? ` (${i.quantity})` : ''}${i.note ? ` — ${i.note}` : ''}`
    )
    if (!lines.length) return
    window.open(`https://wa.me/?text=${encodeURIComponent(`🛒 רשימת קניות:\n${lines.join('\n')}`)}`, '_blank')
  }

  async function sendShoppingAlert() {
    if (shoppingAlertSent || shoppingAlertLoading) return
    setShoppingAlertLoading(true)
    setShoppingAlertResult(null)
    try {
      // Activates mode for ALL devices instantly (broadcast + DB)
      await setShoppingMode(true)
      setShoppingAlertSent(true)
      setTimeout(() => { setShoppingAlertSent(false); setShoppingAlertResult(null) }, 12_000)
      // Push notification — await to show real result
      try {
        const r = await fetch('/api/push/shopping-alert', { method: 'POST' })
        const data = await r.json() as { sent?: number; debug?: string }
        console.log('[Push] Shopping alert result:', data)
        if ((data.sent ?? 0) > 0) {
          setShoppingAlertResult(`נשלח ל-${data.sent} מכשיר${data.sent === 1 ? '' : 'ים'}`)
        } else {
          setShoppingAlertResult('אין מכשירים מחוברים')
        }
      } catch (e) {
        console.error('[Push] Shopping alert error:', e)
        setShoppingAlertResult('שגיאה בשליחה')
      }
      // Ask Bob to sync the Sally shopping list (user-auth endpoint — no bot token needed)
      fetch('/api/shopping/sync-request', { method: 'POST' }).catch(() => {})
    } catch (err) {
      console.error('[ShoppingMode] Activation failed:', err)
    } finally {
      setShoppingAlertLoading(false)
    }
  }

  const pending = items.filter(i => !i.done)
  const done = items.filter(i => i.done)
  const hasCategories = pending.some(i => i.category && i.category !== 'כללי')
  const grouped = groupByAisle(pending)

  return (
    <>
    {/* Cart Builder Modal (RL-first, production quality) */}
    {showCartBuilder && (
      <CartBuilderModal onClose={() => setShowCartBuilder(false)} items={pending.map(i => ({ text: i.text, quantity: i.quantity }))} />
    )}

    {/* Order Review Modal (legacy prepare-order) */}
    {orderResult && (
      <OrderReviewModal
        order={orderResult}
        onClose={() => setOrderResult(null)}
      />
    )}

    {/* Shopping History Modal */}
    {showHistory && (
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-sm"
        onClick={() => setShowHistory(false)}
      >
        <div
          className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl p-5 shadow-2xl max-h-[80vh] flex flex-col"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">היסטוריית קניות</p>
            <button onClick={() => setShowHistory(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="overflow-y-auto flex-1 -mx-1 px-1">
            {historyLoading && <p className="text-center py-10 text-zinc-400 dark:text-zinc-500 text-sm">טוען...</p>}
            {!historyLoading && historyList.length === 0 && (
              <div className="text-center py-10">
                <p className="text-3xl mb-2">🛒</p>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">אין היסטוריה עדיין</p>
                <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">לאחר הכנת הזמנה תופיע כאן</p>
              </div>
            )}
            {historyList.map(entry => {
              const isExpanded = expandedHistoryId === entry.id
              const date = new Date(entry.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
              return (
                <div key={entry.id} className="border border-zinc-100 dark:border-zinc-800 rounded-2xl mb-2.5 overflow-hidden">
                  {/* div instead of button — can't nest buttons inside a button (invalid HTML) */}
                  <div
                    role="button"
                    tabIndex={0}
                    className="w-full flex items-center justify-between px-4 py-3 text-right hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150 cursor-pointer"
                    onClick={() => setExpandedHistoryId(isExpanded ? null : entry.id)}
                    onKeyDown={e => e.key === 'Enter' && setExpandedHistoryId(isExpanded ? null : entry.id)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">🛒</span>
                      <div className="text-right">
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{date}</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">{entry.items.length} פריטים</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); restoreHistory(entry) }}
                        className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 bg-violet-50 dark:bg-violet-950/40 px-2.5 py-1 rounded-lg transition-colors duration-150"
                      >
                        שחזר
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteHistory(entry.id) }}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-rose-500 transition-colors duration-150"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className={`text-zinc-300 dark:text-zinc-600 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
                      <div className="space-y-1 pt-1">
                        {entry.items.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 flex-shrink-0" />
                            <span className="flex-1">{item.text}</span>
                            {item.quantity && <span className="text-zinc-400 dark:text-zinc-500">×{item.quantity}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )}

    {/* Magic Paste Modal */}
    {pasteModal && (
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-sm"
        onClick={() => !pasteLoading && setPasteModal(false)}
      >
        <div
          className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl p-5 shadow-2xl"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">✨ הדבק טקסט</p>
            <button
              onClick={() => setPasteModal(false)}
              disabled={pasteLoading}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={'הדבק פה הודעת וואטסאפ, רשימה, או כל טקסט...\nלדוגמה: "חלב, 2 קילו עגבניות, שמפו"'}
            rows={6}
            autoFocus
            className={inputCls + ' resize-none'}
          />
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 mb-4">
            הAI יזהה את הפריטים ויסדר אותם לפי מחלקה בסופר
          </p>
          <button
            onClick={parsePaste}
            disabled={!pasteText.trim() || pasteLoading}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-semibold transition-colors duration-150"
          >
            {pasteLoading ? '🪄 מנתח...' : '🪄 פרסר והוסף לרשימה'}
          </button>
        </div>
      </div>
    )}

    <div className="max-w-lg mx-auto px-4 pt-7 pb-nav page-in">

      {/* Undo toast */}
      {pendingDelete && (
        <div className="fixed bottom-28 right-1/2 translate-x-1/2 z-50 flex items-center gap-3 bg-zinc-900 dark:bg-zinc-800 text-white rounded-2xl px-4 py-3 shadow-xl whitespace-nowrap">
          <span className="text-sm">"{pendingDelete.text}" נמחק</span>
          <button onClick={undoDelete} className="text-violet-400 text-sm font-semibold hover:text-violet-300 transition-colors duration-150">בטל</button>
        </div>
      )}

      {/* Bulk-clear undo toast */}
      {pendingClear.length > 0 && (
        <div className="fixed bottom-28 right-1/2 translate-x-1/2 z-50 flex items-center gap-3 bg-zinc-900 dark:bg-zinc-800 text-white rounded-2xl px-4 py-3 shadow-xl whitespace-nowrap">
          <span className="text-sm">{pendingClear.length} פריטים יימחקו</span>
          <button onClick={undoClear} className="text-violet-400 text-sm font-semibold hover:text-violet-300 transition-colors duration-150">בטל</button>
        </div>
      )}

      {/* Error toasts */}
      {addError && (
        <div className="fixed bottom-28 right-1/2 translate-x-1/2 z-50 bg-rose-600 text-white text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl whitespace-nowrap">
          {addError}
        </div>
      )}
      {orderError && (
        <div className="fixed bottom-28 right-1/2 translate-x-1/2 z-50 bg-rose-600 text-white text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl whitespace-nowrap">
          {orderError}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">קניות</h1>
        <div className="flex items-center gap-2">
          {/* Test push — tap to verify the full push pipeline works */}
          {notifPermission === 'granted' && (
            <button
              onClick={sendTestPush}
              disabled={testPushStatus === 'sending'}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-150 ${
                testPushStatus === 'ok' ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                : testPushStatus === 'fail' ? 'text-rose-500 bg-rose-50 dark:bg-rose-950/30'
                : 'text-zinc-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30'
              }`}
              title="שלח push בדיקה לעצמך"
            >
              {testPushStatus === 'ok' ? '✓' : testPushStatus === 'fail' ? '✗' : '🔔'}
            </button>
          )}

          {/* Shopping history */}
          <button
            onClick={openHistory}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors duration-150"
            title="היסטוריית קניות"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </button>

          {/* Magic Paste */}
          <button
            onClick={() => setPasteModal(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors duration-150"
            title="הדבק טקסט ✨"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 12h6M9 16h4"/>
            </svg>
          </button>

          {/* Supermarket alert */}
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={sendShoppingAlert}
              disabled={shoppingAlertSent || shoppingAlertLoading}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-all duration-200 ${
                shoppingAlertSent
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                  : 'bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50'
              }`}
            >
              {shoppingAlertSent ? '✓ נשלח!' : shoppingAlertLoading ? '...' : 'אני בסופר! 🛒'}
            </button>
            {shoppingAlertResult && (
              <span className={`text-[10px] font-medium ${shoppingAlertResult.includes('אין') || shoppingAlertResult.includes('שגיאה') ? 'text-amber-500' : 'text-emerald-500'}`}>
                {shoppingAlertResult}
              </span>
            )}
          </div>

          {/* Build Rami Levy cart */}
          {pending.length > 0 && (
            <button
              onClick={() => setShowCartBuilder(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-colors duration-200"
              title="בנה סל ברמי לוי"
            >
              🛒 בנה סל
            </button>
          )}

          {pending.length > 0 && (
            <button
              onClick={shareOnWhatsApp}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors duration-150"
              title="שתף בוואטסאפ"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.68A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
              </svg>
            </button>
          )}
          <BackButton />
        </div>
      </div>

      {/* Push permission banner — shown until user grants permission */}
      {notifPermission !== null && notifPermission !== 'granted' && (
        <button
          onClick={handleEnablePush}
          className="w-full flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl px-4 py-3 mb-4 text-right active:opacity-75 transition-opacity"
        >
          <span className="text-xl">🔔</span>
          <p className="flex-1 text-sm font-medium text-amber-800 dark:text-amber-300">
            {notifPermission === 'denied'
              ? 'התראות חסומות — פתח הגדרות כדי להפעיל'
              : 'כדי לקבל התראות כשיוצאים לסופר, לחצו כאן להפעלה'}
          </p>
          {notifPermission !== 'denied' && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex-shrink-0">הפעל</span>
          )}
        </button>
      )}

      {/* Supermarket mode banner */}
      {supermarketMode && (
        <div className="flex items-center gap-2 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/60 rounded-2xl px-4 py-2.5 mb-4">
          <span className="text-lg">🛒</span>
          <p className="text-sm font-medium text-violet-700 dark:text-violet-300 flex-1">מצב סופר פעיל</p>
          {/* Exit: deactivates for everyone via broadcast + DB */}
          <button
            onClick={() => setShoppingMode(false)}
            className="text-xs text-violet-400 hover:text-violet-600 transition-colors duration-150"
          >
            יציאה
          </button>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={addItem} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 mb-5 space-y-3 shadow-sm">
          <input value={text} onChange={e => setText(e.target.value)} placeholder="שם הפריט *" required className={inputCls} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="כמות" className={inputCls} />
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="הערה" className={inputCls} />
          </div>
          {/* Category chips */}
          <div className="flex flex-wrap gap-1.5">
            {AISLE_ORDER.filter(a => a !== 'כללי').map(aisle => (
              <button key={aisle} type="button"
                onClick={() => setCategory(prev => prev === aisle ? '' : aisle)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors duration-100 ${category === aisle ? 'bg-violet-100 dark:bg-violet-950/50 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'}`}>
                {aisle}
              </button>
            ))}
          </div>
          <button type="submit" disabled={!text.trim()} className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150">
            הוסף{category ? ` ל${category}` : ''}
          </button>
        </form>
      )}

      {pending.length === 0 && done.length === 0 && !showAddForm && (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🛒</p>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">הרשימה ריקה</p>
          <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">לחץ + להוסיף, או הדבק טקסט ✨</p>
        </div>
      )}

      {/* Pending items — grouped by aisle when categories exist */}
      {pending.length > 0 && (
        hasCategories ? (
          <div className="space-y-4 mb-4">
            {[...grouped].map(([aisle, aisleItems]) => (
              <div key={aisle}>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">{aisle}</p>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
                  {aisleItems.map(item => (
                    <ItemRow key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} onEdit={startEdit}
                      editing={editingId === item.id} editForm={editForm} setEditForm={setEditForm}
                      onSaveEdit={saveEdit} onCancelEdit={() => setEditingId(null)} supermarketMode={supermarketMode} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden mb-4">
            {pending.map(item => (
              <ItemRow key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} onEdit={startEdit}
                editing={editingId === item.id} editForm={editForm} setEditForm={setEditForm}
                onSaveEdit={saveEdit} onCancelEdit={() => setEditingId(null)} supermarketMode={supermarketMode} />
            ))}
          </div>
        )
      )}

      {/* Done / in-cart items */}
      {done.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              {supermarketMode ? '🛒 כבר בעגלה' : 'נקנה'}
            </p>
            <button
              onClick={clearDone}
              className="text-xs text-rose-400 hover:text-rose-600 font-medium px-2.5 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors duration-150"
            >
              נקה הכל
            </button>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {done.map(item => (
              <ItemRow key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} onEdit={startEdit}
                editing={editingId === item.id} editForm={editForm} setEditForm={setEditForm}
                onSaveEdit={saveEdit} onCancelEdit={() => setEditingId(null)} supermarketMode={supermarketMode} />
            ))}
          </div>
        </div>
      )}

    </div>

    {/* FAB — outside page-in to avoid transform stacking context */}
    <button
      onClick={() => setShowAddForm(v => !v)}
      className="fixed bottom-24 left-6 z-50 w-14 h-14 bg-violet-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl active:scale-95 transition-transform"
      aria-label={showAddForm ? 'סגור' : 'הוסף פריט'}
    >
      {showAddForm ? '×' : '+'}
    </button>
    </>
  )
}

function OrderReviewModal({ order, onClose }: { order: PreparedOrder; onClose: () => void }) {
  const matched = order.lines.filter(l => l.status === 'matched')
  const substituted = order.lines.filter(l => l.status === 'substituted')
  const missing = order.lines.filter(l => l.status === 'missing')
  const [copied, setCopied] = useState(false)

  function buildShareLines(): string[] {
    const lines: string[] = ['HomeBase — קניות ברמי לוי 🛒']
    matched.forEach(l => lines.push(`✓ ${l.product!.name}${l.quantity ? ` × ${l.quantity}` : ''}`))
    substituted.forEach(l => lines.push(`~ ${l.product!.name} (במקום: ${l.itemText})`))
    missing.forEach(l => lines.push(`✕ לא נמצא: ${l.itemText}`))
    return lines
  }

  function copyProductList() {
    navigator.clipboard.writeText(buildShareLines().join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }).catch(() => {/* clipboard unavailable */})
  }

  function shareWhatsApp() {
    const text = buildShareLines().join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0">
          <div>
            <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">תוצאות חיפוש — {order.retailerName}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              {matched.length} נמצא · {substituted.length} חלופה · {missing.length} חסר
              {order.estimatedTotal != null && ` · ~${order.estimatedTotal}₪`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Matched */}
          {matched.length > 0 && (
            <OrderSection title="נמצא" count={matched.length} accent="emerald">
              {matched.map(line => <ProductLine key={line.itemId} line={line} />)}
            </OrderSection>
          )}

          {/* Substituted */}
          {substituted.length > 0 && (
            <OrderSection title="חלופה" count={substituted.length} accent="amber">
              {substituted.map(line => <ProductLine key={line.itemId} line={line} />)}
            </OrderSection>
          )}

          {/* Missing */}
          {missing.length > 0 && (
            <OrderSection title="לא נמצא" count={missing.length} accent="rose">
              {missing.map(line => (
                <div key={line.itemId} className="flex items-center gap-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                  <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-500 text-xs">✕</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{line.itemText}</p>
                    {line.quantity && <p className="text-xs text-zinc-400">{line.quantity}</p>}
                  </div>
                </div>
              ))}
            </OrderSection>
          )}

          <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center pb-2">
            לחץ על פריט לחיפוש ישיר ברמי לוי 🔍
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex-shrink-0 space-y-2" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          <div className="flex gap-2">
            <a
              href="https://www.rami-levy.co.il/he"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold py-3 rounded-xl text-center transition-colors"
            >
              פתח רמי לוי 🛒
            </a>
            <button
              onClick={copyProductList}
              className={`flex-1 text-sm font-semibold py-3 rounded-xl transition-colors ${
                copied
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {copied ? '✓ הועתק' : 'העתק רשימה'}
            </button>
            <button
              onClick={shareWhatsApp}
              className="w-11 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600 text-zinc-500 dark:text-zinc-400 py-3 rounded-xl transition-colors"
              title="שתף בוואטסאפ"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.68A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
              </svg>
            </button>
            <button
              onClick={onClose}
              className="px-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-sm py-3 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              סגור
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center">
            לחץ על פריט לחיפוש · שתף בוואטסאפ עם שאר הבית
          </p>
        </div>
      </div>
    </div>
  )
}

function OrderSection({ title, count, accent, children }: {
  title: string; count: number; accent: 'emerald' | 'amber' | 'rose'; children: React.ReactNode
}) {
  const colors = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
  }
  return (
    <div>
      <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${colors[accent]}`}>{title} ({count})</p>
      <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-700/50 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function ProductLine({ line }: { line: OrderLine }) {
  const p = line.product!
  const accentDot = line.status === 'substituted'
    ? 'bg-amber-400'
    : 'bg-emerald-400'

  return (
    <a
      href={`https://www.rami-levy.co.il/he/online/search?q=${encodeURIComponent(p.name)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-white dark:hover:bg-zinc-700/50 transition-colors"
    >
      {/* Product image or placeholder */}
      <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain" />
        ) : (
          <span className="text-lg">🥫</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Item requested */}
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${accentDot} mr-1 mb-0.5`} />
          {line.itemText}{line.quantity ? ` × ${line.quantity}` : ''}
        </p>
        {/* Matched product */}
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate leading-tight">{p.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {p.brand && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{p.brand}</p>}
          {p.contentText && <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{p.contentText}</p>}
          {line.note && <p className="text-[11px] text-amber-500 truncate">{line.note}</p>}
        </div>
      </div>

      {/* Price + external link icon */}
      <div className="flex-shrink-0 text-right">
        {p.price != null && (
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{p.price}₪</p>
        )}
        <svg className="w-3 h-3 text-zinc-300 dark:text-zinc-600 mt-0.5 mr-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </div>
    </a>
  )
}

function ItemRow({
  item, onToggle, onDelete, onEdit, editing, editForm, setEditForm, onSaveEdit, onCancelEdit, supermarketMode,
}: {
  item: ShoppingItem
  onToggle: (item: ShoppingItem) => void
  onDelete: (id: string) => void
  onEdit: (item: ShoppingItem) => void
  editing: boolean
  editForm: EditForm
  setEditForm: React.Dispatch<React.SetStateAction<EditForm>>
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  supermarketMode: boolean
}) {
  const rowInputCls = 'bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all duration-150'

  if (editing) {
    return (
      <div className="px-4 py-3 space-y-2.5 bg-violet-50/50 dark:bg-violet-950/20">
        <input value={editForm.text} onChange={e => setEditForm(f => ({ ...f, text: e.target.value }))} className={`w-full ${rowInputCls}`} />
        <div className="grid grid-cols-2 gap-2">
          <input value={editForm.quantity} onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))} placeholder="כמות" className={rowInputCls} />
          <input value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} placeholder="הערה" className={rowInputCls} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => onSaveEdit(item.id)} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold py-2 rounded-xl transition-colors duration-150">שמור</button>
          <button onClick={onCancelEdit} className="flex-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-medium py-2 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors duration-150">ביטול</button>
        </div>
      </div>
    )
  }

  const cbSize = supermarketMode ? 'w-7 h-7' : 'w-5 h-5'
  const cbRadius = supermarketMode ? 'rounded-lg' : 'rounded-md'
  const checkSize = supermarketMode ? 13 : 10

  return (
    <div className={`flex items-center gap-3 px-4 ${supermarketMode ? 'py-4' : 'py-3.5'} transition-colors duration-150 ${item.done ? 'opacity-50' : ''}`}>
      <button
        onClick={() => onToggle(item)}
        className={`${cbSize} ${cbRadius} border-2 flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
          item.done ? 'bg-violet-600 border-violet-600' : 'border-zinc-300 dark:border-zinc-600 hover:border-violet-400'
        }`}
      >
        {item.done && (
          <svg width={checkSize} height={checkSize} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <span className={`font-medium ${supermarketMode ? 'text-base' : 'text-sm'} ${item.done ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}>
          {item.text}
          {item.quantity && (
            <span className="text-zinc-400 dark:text-zinc-500 text-xs font-normal mr-1.5">× {item.quantity}</span>
          )}
        </span>
        {item.note && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{item.note}</p>}
      </div>

      {!supermarketMode && (
        <div className="flex gap-0.5 flex-shrink-0">
          {!item.done && (
            <button onClick={() => onEdit(item)} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors duration-150">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
          <button onClick={() => onDelete(item.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors duration-150">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
