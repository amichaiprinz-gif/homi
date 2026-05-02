'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { he } from 'date-fns/locale'
import BackButton from '@/components/BackButton'

interface Post {
  id: string
  user_id: string
  display_name: string
  content: string
  expires_at: string | null
  created_at: string
}

const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all duration-150'

const EXPIRY_OPTIONS = [
  { label: 'ללא תפוגה', value: '' },
  { label: 'שעה', value: '1' },
  { label: '6 שעות', value: '6' },
  { label: 'יום', value: '24' },
  { label: 'שבוע', value: '168' },
]

interface Props {
  userId: string
  householdId: string | null
}

export default function BulletinClient({ userId, householdId }: Props) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [content, setContent] = useState('')
  const [expiresHours, setExpiresHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!householdId) { setLoading(false); return }
    fetch('/api/bulletin')
      .then(r => r.json())
      .then(d => Array.isArray(d) && setPosts(d))
      .finally(() => setLoading(false))
  }, [householdId])

  async function addPost(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSaving(true); setError('')
    const res = await fetch('/api/bulletin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', content, expires_hours: expiresHours || null }),
    })
    const data = await res.json()
    if (data.error) setError(data.error)
    else {
      setPosts(prev => [data, ...prev])
      setContent(''); setExpiresHours(''); setShowAdd(false)
    }
    setSaving(false)
  }

  async function deletePost(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
    await fetch('/api/bulletin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
  }

  return (
    <>
    <div className="max-w-lg mx-auto px-4 pt-7 pb-nav page-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">לוח מודעות</h1>
          <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-0.5">הודעות למשק הבית</p>
        </div>
        <BackButton />
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs px-4 py-3 rounded-2xl mb-4 text-center font-medium">{error}</div>
      )}

      {!householdId && (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🏠</p>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">הצטרף לבית כדי להשתמש בלוח</p>
        </div>
      )}

      {householdId && (
        <>
          {/* Add post form */}
          {showAdd && (
            <form onSubmit={addPost} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 mb-5 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">הודעה חדשה</p>
                <button type="button" onClick={() => setShowAdd(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors duration-150 text-base leading-none">✕</button>
              </div>
              <textarea
                required
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="כתוב הודעה למשפחה..."
                rows={3}
                maxLength={500}
                className={inputCls + ' resize-none'}
                autoFocus
              />
              <select value={expiresHours} onChange={e => setExpiresHours(e.target.value)} className={inputCls}>
                {EXPIRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="submit" disabled={saving || !content.trim()}
                className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150">
                {saving ? 'שולח...' : 'פרסם'}
              </button>
            </form>
          )}

          {loading && <div className="text-center py-16 text-zinc-400 dark:text-zinc-500 text-sm">טוען...</div>}

          {!loading && posts.length === 0 && !showAdd && (
            <div className="text-center py-20">
              <p className="text-4xl mb-3">📌</p>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">הלוח ריק</p>
              <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">לחץ + כדי לפרסם הודעה</p>
            </div>
          )}

          {posts.length > 0 && (
            <div className="space-y-3">
              {posts.map(post => {
                const isOwn = post.user_id === userId
                const expiresLabel = post.expires_at
                  ? 'פג תוקף ' + formatDistanceToNow(new Date(post.expires_at), { locale: he, addSuffix: true })
                  : null
                return (
                  <div key={post.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-800/60 flex items-center justify-center text-violet-600 dark:text-violet-400 text-xs font-bold flex-shrink-0">
                          {post.display_name?.[0] ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">{post.display_name}</p>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            {formatDistanceToNow(new Date(post.created_at), { locale: he, addSuffix: true })}
                            {expiresLabel && <span className="mr-1 text-amber-500">· {expiresLabel}</span>}
                          </p>
                        </div>
                      </div>
                      {isOwn && (
                        <button onClick={() => deletePost(post.id)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors duration-150 flex-shrink-0">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>

    {householdId && (
      <button
        onClick={() => setShowAdd(v => !v)}
        className="fixed bottom-24 left-6 z-50 w-14 h-14 bg-violet-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl active:scale-95 transition-transform"
        aria-label={showAdd ? 'סגור' : 'הוסף הודעה'}
      >
        {showAdd ? '×' : '+'}
      </button>
    )}
    </>
  )
}
