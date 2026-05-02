'use client'

/**
 * /shopping/match-frame
 *
 * A minimal popup page opened by the HomeBase bookmarklet running on rami-levy.co.il.
 * Because RL's CSP blocks fetch() to our domain, the bookmarklet can't call our API
 * directly. Instead it opens this popup (our domain = no CSP restriction) and
 * communicates via postMessage.
 *
 * Protocol:
 *   1. This page fetches the session items from our API.
 *   2. Sends { type: 'hb_items', items } to opener (bookmarklet on RL).
 *   3. Bookmarklet searches RL for candidates and sends { type: 'hb_candidates', candidates }.
 *   4. This page calls the AI matching API and sends { type: 'hb_matched', items } back.
 *   5. Page closes itself.
 */

import { useEffect, useState } from 'react'

export default function MatchFrame() {
  const [status, setStatus] = useState('מאתחל...')

  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get('sid')

    if (!sid) {
      setStatus('שגיאה: אין מזהה סשן')
      return
    }
    const isIframe = window.parent !== window
    const target = window.opener || (isIframe ? window.parent : null)
    if (!target) {
      setStatus('שגיאה: אין חלון מקור')
      return
    }

    let cancelled = false

    async function run() {
      // ── Phase 1: fetch session items ──────────────────────────────────────
      setStatus('משך רשימה...')
      const r0 = await fetch(`/api/shopping/build-session/${sid}`)
      if (!r0.ok) throw new Error(`session HTTP ${r0.status}`)
      const sess = await r0.json()
      const items: { text: string; quantity: string | null }[] = sess.raw_items ?? []

      if (cancelled) return

      // Tell the bookmarklet which items to search for
      target.postMessage({ type: 'hb_items', items }, '*')
      setStatus('מחפש מוצרים...')

      // ── Phase 2: wait for candidates from bookmarklet ─────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidates = await new Promise<Record<string, any[]>>((resolve, reject) => {
        const tmr = setTimeout(() => reject(new Error('search timeout')), 120_000)
        function handler(e: MessageEvent) {
          if (e.data?.type !== 'hb_candidates') return
          clearTimeout(tmr)
          window.removeEventListener('message', handler)
          resolve(e.data.candidates)
        }
        window.addEventListener('message', handler)
      })

      if (cancelled) return
      setStatus('Claude מתאים מוצרים...')

      // ── Phase 3: AI matching (same origin — no CSP) ───────────────────────
      const r1 = await fetch(`/api/shopping/build-session/${sid}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, candidates }),
      })
      if (!r1.ok) throw new Error(`AI HTTP ${r1.status}`)
      const matched = await r1.json()

      if (!cancelled) {
        target.postMessage({ type: 'hb_matched', items: matched }, '*')
        setStatus('מוכן!')
        setTimeout(() => window.close(), 600)
      }
    }

    run().catch(err => {
      if (!cancelled) {
        target?.postMessage({ type: 'hb_error', message: String(err) }, '*')
        setStatus('שגיאה: ' + String(err))
        setTimeout(() => window.close(), 3000)
      }
    })

    return () => { cancelled = true }
  }, [])

  return (
    <div style={{
      padding: 20,
      fontFamily: 'Arial, sans-serif',
      direction: 'rtl',
      textAlign: 'right',
      fontSize: 14,
      color: '#374151',
      background: '#fff',
      minHeight: '100vh',
    }}>
      <p style={{ margin: 0, fontWeight: 700 }}>🛒 HomeBase</p>
      <p style={{ margin: '8px 0 0', color: '#6b7280' }}>{status}</p>
    </div>
  )
}
