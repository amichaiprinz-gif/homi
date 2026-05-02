/**
 * HomeBase Chrome Extension — Content Script
 *
 * Runs on https://www.rami-levy.co.il/*
 *
 * Flow:
 *   1. Detects #hb_session=<uuid> in the URL hash (set by HomeBase when opening RL)
 *   2. Fetches the item list from HomeBase API (no CSP issue — extension bypasses it)
 *   3. Searches RL for up to 8 candidates per item (same-origin fetch, uses ecomtoken)
 *   4. POSTs candidates to HomeBase for Claude AI matching
 *   5. Shows an in-page overlay with the matched preview + X buttons
 *   6. On confirm, adds all items to the RL cart in one request
 *
 * No popup, no iframe, no postMessage dance — extensions bypass connect-src CSP.
 */

'use strict'

const HB = 'https://fantastic-waddle-coral.vercel.app'

// ── Entry ─────────────────────────────────────────────────────────────────────

;(function init() {
  checkHash()
  window.addEventListener('hashchange', checkHash)
})()

function checkHash() {
  const sid = location.hash.match(/hb_session=([0-9a-f-]{36})/i)?.[1]
  if (sid && !document.getElementById('hbov')) {
    // Remove the hash immediately so refresh / back-button doesn't re-trigger
    history.replaceState(null, '', location.pathname + location.search)
    runFlow(sid)
  }
}

// ── Main flow ─────────────────────────────────────────────────────────────────

async function runFlow(sid) {
  let rl = {}
  try { rl = JSON.parse(localStorage.getItem('ramilevy') || '{}') } catch {}
  const tok   = rl?.authuser?.user?.token    || ''
  const store = String(rl?.authuser?.user?.store_id || '331')

  const { ov, setContent } = createOverlay()

  if (!tok) {
    setContent('<p style="color:#dc2626;text-align:center;padding:12px">\u05D4\u05EA\u05D7\u05D1\u05E8 \u05DC\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9 \u05E7\u05D5\u05D3\u05DD</p>')
    return
  }

  try {
    // ── Phase 1: fetch session items ──────────────────────────────────────────
    setContent(spinner('\u05DE\u05D0\u05EA\u05D7\u05DC...'))

    const r0 = await fetch(`${HB}/api/shopping/build-session/${sid}`)
    if (!r0.ok) throw new Error(`session HTTP ${r0.status}`)
    const { raw_items: items = [] } = await r0.json()
    if (!items.length) throw new Error('\u05D0\u05D9\u05DF \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD')

    // ── Phase 2: search RL for candidates ────────────────────────────────────
    const cands = {}
    for (let i = 0; i < items.length; i++) {
      setContent(spinner(`\uD83D\uDD0D \u05DE\u05D7\u05E4\u05E9 ${i + 1}/${items.length}: ${items[i].text}`))
      try {
        const sr = await fetch(
          `/api/search?q=${encodeURIComponent(items[i].text)}&store=${store}&size=8`,
          { headers: { ecomtoken: tok } }
        ).then(x => x.json()).catch(() => ({ data: [] }))
        cands[items[i].text] = (sr?.data || []).slice(0, 8).map(p => ({
          id:      p.id,
          name:    p.name,
          price:   p.price?.price   ?? null,
          brand:   p.gs?.BrandName  ?? null,
          content: p.gs?.Net_Content?.text ?? null,
        }))
      } catch {
        cands[items[i].text] = []
      }
      if (i < items.length - 1) await sleep(300)
    }

    // ── Phase 3: AI matching ──────────────────────────────────────────────────
    setContent(spinner('Claude \u05DE\u05EA\u05D0\u05D9\u05DD \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD...'))

    const r1 = await fetch(`${HB}/api/shopping/build-session/${sid}/candidates`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ items, candidates: cands }),
    })
    if (!r1.ok) throw new Error(`AI HTTP ${r1.status}`)
    const matched = await r1.json()

    // ── Phase 4: preview ──────────────────────────────────────────────────────
    showPreview(ov, setContent, matched, tok, store, sid)

  } catch (e) {
    console.error('[HomeBase]', e)
    setContent(`<p style="color:#dc2626;padding:12px">\u05E9\u05D2\u05D9\u05D0\u05D4: ${esc(e.message)}</p>`)
  }
}

// ── Preview overlay ───────────────────────────────────────────────────────────

function showPreview(ov, setContent, matched, tok, store, sid) {
  // Local mutable list of active (non-removed) items
  let actv = matched
    .filter(x => x.status !== 'not_found' && x.rlProductId)
    .map(x => ({ ...x }))

  // Track items the user explicitly removed — these become 'bad' feedback
  const removedItems = []

  const COLOR = { matched: '#16a34a', substituted: '#d97706', not_found: '#dc2626' }
  const ICON  = { matched: '\u2713',  substituted: '\u26A0',  not_found: '\u2717' }

  // Build the HTML once; subsequent mutations (remove) touch the DOM directly
  function buildHtml() {
    let h = ''
    h += `<div style="font-weight:700;font-size:15px;margin-bottom:2px">`
    h += `\uD83D\uDED2 \u05EA\u05E6\u05D5\u05D2\u05D4 \u05DE\u05E7\u05D3\u05D9\u05DE\u05D4 (${actv.length}/${matched.length})</div>`
    h += `<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">\u05DC\u05D7\u05E5 \u2715 \u05DC\u05D4\u05E1\u05E8\u05EA \u05E4\u05E8\u05D9\u05D8</div>`

    matched.forEach(x => {
      const color = COLOR[x.status] || '#6b7280'
      const icon  = ICON[x.status]  || '?'
      const isAct = x.status !== 'not_found' && x.rlProductId

      const rmBtn = isAct
        ? `<button data-hb-remove="${x.rlProductId}" style="border:none;background:none;cursor:pointer;color:#d1d5db;font-size:16px;padding:0 0 0 6px;flex-shrink:0;line-height:1" title="\u05D4\u05E1\u05E8">\u2715</button>`
        : ''

      h += `<div id="hbr${x.rlProductId}" style="padding:7px 0;border-bottom:1px solid #f3f4f6;display:flex;gap:6px;align-items:flex-start">`
      h += `<span style="color:${color};font-weight:700;min-width:14px;flex-shrink:0;margin-top:1px">${icon}</span>`
      h += `<div style="flex:1;min-width:0">`
      h += `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.rlProductName || x.itemText)}</div>`
      if (x.note) h += `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${esc(x.note)}</div>`
      h += `</div>`
      if (x.rlProductPrice) {
        h += `<span style="font-size:12px;color:#9ca3af;white-space:nowrap;flex-shrink:0">\u20AA${x.rlProductPrice}</span>`
      }
      h += rmBtn + `</div>`
    })

    const tot = matched.reduce((s, x) => s + (x.rlProductPrice || 0), 0)
    if (tot > 0) {
      h += `<div style="margin-top:10px;font-weight:700">\u05E1\u05D4"\u05DB: \u20AA${tot.toFixed(2)}</div>`
    }

    const disabled = actv.length === 0 ? 'disabled style="opacity:.5"' : ''
    h += `<div style="display:flex;gap:8px;margin-top:14px">`
    h += `<button data-hb-cancel style="padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;cursor:pointer;font-size:14px">\u05D1\u05D9\u05D8\u05D5\u05DC</button>`
    h += `<button data-hb-add ${disabled} style="flex:1;padding:10px;border:none;border-radius:8px;background:#f59e0b;color:#fff;font-weight:700;cursor:pointer;font-size:14px">`
    h += actv.length ? `\u05D4\u05D5\u05E1\u05E3 ${actv.length} \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD \u05DC\u05E1\u05DC` : '\u05D0\u05D9\u05DF \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD'
    h += `</button></div>`

    return h
  }

  setContent(buildHtml())

  // Single delegated event listener on the card — survives innerHTML mutations of children
  const crd = ov.querySelector('[data-hbcrd]')
  crd.addEventListener('click', function handler(e) {
    // Remove item
    const removeBtn = e.target.closest('[data-hb-remove]')
    if (removeBtn) {
      const id = Number(removeBtn.dataset.hbRemove)
      const removedItem = actv.find(x => x.rlProductId === id)
      if (removedItem) removedItems.push(removedItem)
      actv = actv.filter(x => x.rlProductId !== id)
      document.getElementById('hbr' + id)?.remove()
      const addBtn = crd.querySelector('[data-hb-add]')
      if (addBtn) {
        if (!actv.length) {
          addBtn.disabled = true
          addBtn.style.opacity = '0.5'
          addBtn.textContent = '\u05D0\u05D9\u05DF \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD'
        } else {
          addBtn.textContent = `\u05D4\u05D5\u05E1\u05E3 ${actv.length} \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD \u05DC\u05E1\u05DC`
        }
      }
      return
    }

    // Cancel
    if (e.target.closest('[data-hb-cancel]')) {
      ov.remove()
      return
    }

    // Add to cart
    if (e.target.closest('[data-hb-add]') && actv.length) {
      crd.removeEventListener('click', handler)
      // Fire feedback in background before adding to cart
      saveFeedback(sid, actv, removedItems)
      addToCart(ov, setContent, actv, tok, store)
    }
  })
}

// ── Preference feedback ───────────────────────────────────────────────────────

function saveFeedback(sid, kept, removed) {
  // Fire-and-forget — don't block cart addition on this
  const payload = {
    sid,
    kept:    kept.map(x => ({ itemText: x.itemText, rlProductId: x.rlProductId, rlProductName: x.rlProductName ?? null })),
    removed: removed.map(x => ({ itemText: x.itemText, rlProductId: x.rlProductId, rlProductName: x.rlProductName ?? null })),
  }
  fetch(`${HB}/api/shopping/feedback`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  }).catch(() => {}) // ignore errors — non-critical
}

// ── Add to cart ───────────────────────────────────────────────────────────────

async function addToCart(ov, setContent, actv, tok, store) {
  setContent(spinner('\u05DE\u05D5\u05E1\u05D9\u05E3 \u05DC\u05E1\u05DC...'))

  const itms = {}
  actv.forEach(x => {
    itms[String(x.rlProductId)] = Math.max(1, Math.round(Number(x.quantity || 1))).toFixed(2)
  })

  const d = new Date()
  d.setDate(d.getDate() + 1)
  const sa = d.toISOString().split('T')[0] + 'T00:00:00.000Z'

  const at = localStorage.getItem('auth._token.local') || ''
  const hdrs = {
    'Content-Type': 'application/json;charset=UTF-8',
    'accept':  'application/json, text/plain, */*',
    'locale':  'he',
    'ecomtoken': tok,
  }
  if (at) hdrs['authorization'] = at

  let ok = false
  let statusCode = 0
  try {
    const res = await fetch('/api/v2/cart', {
      method:      'POST',
      credentials: 'include',
      headers:     hdrs,
      body:        JSON.stringify({ store, isClub: 0, supplyAt: sa, items: itms, meta: null }),
    })
    statusCode = res.status
    ok = res.ok
    if (!ok) {
      const txt = await res.text().catch(() => '')
      console.error('[HomeBase] cart fail', res.status, txt)
    }
  } catch (e) {
    console.error('[HomeBase] cart error', e)
    setContent(`<p style="color:#dc2626;padding:12px">\u05E9\u05D2\u05D9\u05D0\u05D4: ${esc(e.message)}</p>`)
    return
  }

  const icon = ok ? '\u2705' : '\u26A0\uFE0F'
  const msg  = ok
    ? `\u05E0\u05D5\u05E1\u05E4\u05D5 ${actv.length} \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD \u05DC\u05E1\u05DC!`
    : `\u05E0\u05DB\u05E9\u05DC (${statusCode}) \u2014 \u05E8\u05D0\u05D4 \u05E7\u05D5\u05E0\u05E1\u05D5\u05DC`

  setContent(
    `<div style="text-align:center;padding:12px">` +
    `<div style="font-size:40px">${icon}</div>` +
    `<p style="font-weight:700;margin:10px 0">${msg}</p>` +
    `<button data-hb-close style="padding:8px 20px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;font-size:14px">\u05E1\u05D2\u05D5\u05E8</button>` +
    `</div>`
  )

  ov.querySelector('[data-hbcrd]')?.addEventListener('click', e => {
    if (e.target.closest('[data-hb-close]')) ov.remove()
  })
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function createOverlay() {
  document.getElementById('hbov')?.remove()

  const ov  = document.createElement('div')
  ov.id = 'hbov'
  ov.style.cssText =
    'position:fixed;top:0;left:0;right:0;bottom:0;' +
    'background:rgba(0,0,0,.65);z-index:2147483647;' +
    'display:flex;align-items:center;justify-content:center'

  const crd = document.createElement('div')
  crd.setAttribute('data-hbcrd', '')
  crd.style.cssText =
    'background:#fff;border-radius:16px;padding:24px;' +
    'max-width:420px;width:90%;max-height:85vh;overflow-y:auto;' +
    'direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;color:#111'

  ov.appendChild(crd)
  document.body.appendChild(ov)

  const setContent = html => { crd.innerHTML = html }
  return { ov, setContent }
}

function spinner(msg) {
  return `<p style="text-align:center;padding:12px;color:#6b7280">${esc(msg)}</p>`
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
