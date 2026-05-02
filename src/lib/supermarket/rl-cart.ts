/**
 * Rami Levy Cart Builder — RL-first matching engine.
 *
 * Searches Rami Levy's own /api/search for every item, then uses
 * Claude Haiku to pick the best match from real RL inventory.
 * Falls back to first-candidate if AI is unavailable.
 *
 * Unlike the prepare-order pipeline (OFF-first), every match here
 * is a product that actually exists at Rami Levy with a real product ID.
 */

import { search, getProductUrl, getImageUrl, getPrice, getBrand, getContentText, type RLProduct } from './rami-levy'
import { ollamaChat } from '@/lib/ollama'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CartItemStatus = 'matched' | 'substituted' | 'not_found'

export interface CartItem {
  // Input
  itemId: string
  itemText: string
  quantity: string | null

  // Match result
  status: CartItemStatus
  fromMemory: boolean

  // Matched RL product (null when not_found)
  rlProductId: number | null
  rlProductName: string | null
  rlProductUrl: string | null
  rlProductImage: string | null
  rlProductPrice: number | null
  rlProductBrand: string | null
  rlProductContent: string | null

  // Observability
  searchQuery: string
  candidatesCount: number
  note: string | null
}

export interface CartBuildResult {
  items: CartItem[]
  matchedCount: number
  substitutedCount: number
  notFoundCount: number
  estimatedTotal: number | null
  buildTimeMs: number
}

export interface MemoryEntry {
  rlProductId: number
  rlProductName: string
  rlProductUrl: string
  rlProductImage: string | null
  rlProductPrice: number | null
  rlProductBrand: string | null
  rlProductContent: string | null
}

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalize item text into a stable memory key.
 * Strips quantity specifiers, extra spaces, converts to lowercase.
 *
 * IMPORTANT — alternation order matters: longer strings must precede shorter prefixes.
 * e.g. "יחידות" before "יח" to prevent "30 יחידות" → "ביציםידות" (broken).
 */
export function normalizeKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    // 1. Strip pack notation first: "2x6", "6×1.5", "2X500" etc.
    .replace(/\d+\s*[xX×]\s*\d+\.?\d*/g, '')
    // 2. Strip "N <measurement_unit>" — longer forms before shorter prefixes to avoid collisions.
    //    Only pure measurement words here (not container words like בקבוק which can be item names).
    .replace(
      /\s*\d+\.?\d*\s*(קילוגרמים|קילוגרם|יחידות|ליטרים|גלילים|כוסות|קילו|גרם|ק"ג|קג|ליטר|מ"ל|מל|יח'|יח|אחד|אחת)/g,
      '',
    )
    // 3. Strip a bare leading number: "2 עגבניות" → "עגבניות"
    .replace(/^\d+\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseQtyMultiplier(qty: string | null): number {
  if (!qty) return 1
  const n = parseFloat(qty)
  return isNaN(n) || n <= 0 ? 1 : Math.ceil(n)
}

// ── Candidate interface (internal) ────────────────────────────────────────────

interface Candidate {
  product: RLProduct
  url: string
  image: string | null
  price: number | null
  brand: string | null
  content: string | null
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function buildCart(
  items: { id: string; text: string; quantity: string | null }[],
  memoryMap: Map<string, MemoryEntry>,
): Promise<CartBuildResult> {
  const t0 = Date.now()

  // ── 1. Partition: memory hits vs. items needing search ───────────────────
  const resultMap = new Map<string, CartItem>()
  const needsSearch: typeof items = []

  for (const item of items) {
    const key = normalizeKey(item.text)
    const mem = memoryMap.get(key)
    if (mem) {
      resultMap.set(item.id, {
        itemId: item.id, itemText: item.text, quantity: item.quantity,
        status: 'matched', fromMemory: true,
        rlProductId: mem.rlProductId,
        rlProductName: mem.rlProductName,
        rlProductUrl: mem.rlProductUrl,
        rlProductImage: mem.rlProductImage,
        rlProductPrice: mem.rlProductPrice,
        rlProductBrand: mem.rlProductBrand,
        rlProductContent: mem.rlProductContent,
        searchQuery: key, candidatesCount: 0, note: null,
      })
    } else {
      needsSearch.push(item)
    }
  }

  // ── 2. RL search — parallel chunks of 4 ─────────────────────────────────
  const candidateMap = new Map<string, Candidate[]>()
  const searchErrorMap = new Map<string, string>() // itemId → error string

  const CONCURRENCY = 4
  for (let i = 0; i < needsSearch.length; i += CONCURRENCY) {
    const chunk = needsSearch.slice(i, i + CONCURRENCY)
    await Promise.all(chunk.map(async (item) => {
      const query = normalizeKey(item.text)
      try {
        const { products, error } = await search(query, 8)
        if (error) {
          console.warn(`[rl-cart] search error for "${query}": ${error}`)
          searchErrorMap.set(item.id, error)
        }
        const candidates: Candidate[] = products.map(p => ({
          product: p,
          url: getProductUrl(p.id),
          image: getImageUrl(p),
          price: getPrice(p),
          brand: getBrand(p),
          content: getContentText(p),
        })).filter(c => c.product.id && c.product.name)
        console.log(`[rl-cart] "${query}" → ${candidates.length} candidates from RL`)
        candidateMap.set(item.id, candidates)
      } catch (err) {
        const msg = String(err)
        console.error(`[rl-cart] search threw for "${item.text}":`, msg)
        searchErrorMap.set(item.id, msg)
        candidateMap.set(item.id, [])
      }
    }))
    // Brief pause between chunks to avoid hammering RL's API
    if (i + CONCURRENCY < needsSearch.length) {
      await new Promise(r => setTimeout(r, 250))
    }
  }

  // ── 3. AI matching — single batched call for all search-needed items ─────
  if (needsSearch.length > 0) {
    const aiItems = await aiMatchBatch(needsSearch, candidateMap, searchErrorMap)
    for (const item of aiItems) resultMap.set(item.itemId, item)
  }

  // ── 4. Reassemble in original order ─────────────────────────────────────
  const ordered = items.map(item => resultMap.get(item.id)).filter((x): x is CartItem => !!x)

  const matchedCount = ordered.filter(i => i.status === 'matched').length
  const substitutedCount = ordered.filter(i => i.status === 'substituted').length
  const notFoundCount = ordered.filter(i => i.status === 'not_found').length

  const rawTotal = ordered.reduce((sum, item) => {
    if (!item.rlProductPrice) return sum
    return sum + item.rlProductPrice * parseQtyMultiplier(item.quantity)
  }, 0)

  return {
    items: ordered,
    matchedCount,
    substitutedCount,
    notFoundCount,
    estimatedTotal: rawTotal > 0 ? Math.round(rawTotal * 100) / 100 : null,
    buildTimeMs: Date.now() - t0,
  }
}

// ── AI batch matching ─────────────────────────────────────────────────────────

async function aiMatchBatch(
  items: { id: string; text: string; quantity: string | null }[],
  candidateMap: Map<string, Candidate[]>,
  searchErrorMap: Map<string, string> = new Map(),
): Promise<CartItem[]> {
  // Items with zero candidates → immediately not_found (no AI needed)
  const withCandidates = items.filter(i => (candidateMap.get(i.id) ?? []).length > 0)
  const noCandidates = items.filter(i => (candidateMap.get(i.id) ?? []).length === 0)

  const notFoundResults: CartItem[] = noCandidates.map(item => {
    const searchErr = searchErrorMap.get(item.id)
    const note = searchErr ? `שגיאת חיפוש: ${searchErr}` : 'לא נמצא ברמי לוי'
    return {
      itemId: item.id, itemText: item.text, quantity: item.quantity,
      status: 'not_found', fromMemory: false,
      rlProductId: null, rlProductName: null, rlProductUrl: null,
      rlProductImage: null, rlProductPrice: null, rlProductBrand: null, rlProductContent: null,
      searchQuery: normalizeKey(item.text), candidatesCount: 0,
      note,
    }
  })

  if (withCandidates.length === 0) return notFoundResults

  // Build compact prompt: one block per item with up to 6 candidates each
  const blocks = withCandidates.map((item, i) => {
    const candidates = candidateMap.get(item.id)!
    const lines = candidates.slice(0, 6).map((c, j) => {
      const parts: string[] = [c.product.name]
      if (c.brand) parts.push(c.brand)
      if (c.content) parts.push(c.content)
      if (c.price != null) parts.push(`₪${c.price}`)
      return `  ${j}. ${parts.join(' | ')}`
    })
    const qtyNote = item.quantity ? ` (כמות: ${item.quantity})` : ''
    return `[${i}] "${item.text}"${qtyNote}\n${lines.join('\n')}`
  }).join('\n\n')

  try {
    const raw = await ollamaChat(
      [
        {
          role: 'system',
          content: `אתה מומחה להתאמת פריטי קניות למוצרים ברמי לוי ישראל.
לכל פריט, בחר את המוצר המתאים ביותר מהמועמדים הנתונים.

סטטוסים:
• "matched" — המוצר תואם היטב לבקשה
• "substituted" — חלופה סבירה (כשאין מתאים יותר), עם הסבר קצר ב-note
• "not_found" — השתמש רק כשאין אף מועמד רלוונטי בכלל

כללים:
• העדף תמיד "matched" על "substituted" על "not_found" — לא להחמיר יתר על המידה
• חלב נוזלי: 3%/1%/מלא — לא מרוכז/ממותק
• ביצים: ביצי עוף טריות — לא אומלט מוכן
• אם יש מועמד קרוב — בחר אותו כ-"substituted" ולא "not_found"
• רק אם אין שום מועמד רלוונטי — החזר "not_found"

החזר JSON מערך בלבד, ללא טקסט נוסף:
[{"idx":0,"status":"matched","productIndex":0,"note":""},...]`,
        },
        {
          role: 'user',
          content: `התאם את הפריטים הבאים למוצרים ברמי לוי:\n\n${blocks}\n\nהחזר JSON בלבד:`,
        },
      ],
      { maxTokens: 1500, timeoutMs: 14000 },
    )
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('[rl-cart] AI returned no JSON array, raw:', raw.slice(0, 200))
      throw new Error('no_json_array')
    }

    interface AIMatch { idx: number; status: string; productIndex: number | null; note: string }
    const aiMatches: AIMatch[] = JSON.parse(jsonMatch[0])

    const results: CartItem[] = withCandidates.map((item, i) => {
      const candidates = candidateMap.get(item.id)!
      const m = aiMatches.find(x => x.idx === i)

      if (!m || m.status === 'not_found' || m.productIndex == null) {
        const reason = !m ? 'no_ai_entry' : 'ai_marked_not_found'
        console.log(`[rl-cart] not_found item="${item.text}" reason=${reason} candidates=${candidates.length}`)
        // If AI rejected all candidates but we have some, use the top candidate as substituted
        // rather than returning nothing — better a suggestion than empty hands.
        if (candidates.length > 0) {
          const c = candidates[0]
          console.log(`[rl-cart] fallback_substituted item="${item.text}" → "${c.product.name}"`)
          return {
            itemId: item.id, itemText: item.text, quantity: item.quantity,
            status: 'substituted' as CartItemStatus, fromMemory: false,
            rlProductId: c.product.id, rlProductName: c.product.name,
            rlProductUrl: c.url, rlProductImage: c.image,
            rlProductPrice: c.price, rlProductBrand: c.brand, rlProductContent: c.content,
            searchQuery: normalizeKey(item.text), candidatesCount: candidates.length,
            note: 'הצעה בלבד — AI לא מצא התאמה מדויקת',
          }
        }
        return {
          itemId: item.id, itemText: item.text, quantity: item.quantity,
          status: 'not_found' as CartItemStatus, fromMemory: false,
          rlProductId: null, rlProductName: null, rlProductUrl: null,
          rlProductImage: null, rlProductPrice: null, rlProductBrand: null, rlProductContent: null,
          searchQuery: normalizeKey(item.text), candidatesCount: candidates.length,
          note: 'לא נמצאה התאמה מתאימה',
        }
      }

      const c = candidates[m.productIndex] ?? candidates[0]
      const status: CartItemStatus = m.status === 'substituted' ? 'substituted' : 'matched'
      console.log(`[rl-cart] ${status} item="${item.text}" → "${c.product.name}" (idx=${m.productIndex}) price=${c.price ?? 'N/A'}`)

      return {
        itemId: item.id, itemText: item.text, quantity: item.quantity,
        status, fromMemory: false,
        rlProductId: c.product.id,
        rlProductName: c.product.name,
        rlProductUrl: c.url,
        rlProductImage: c.image,
        rlProductPrice: c.price,
        rlProductBrand: c.brand,
        rlProductContent: c.content,
        searchQuery: normalizeKey(item.text), candidatesCount: candidates.length,
        note: m.note || null,
      }
    })

    return [...notFoundResults, ...results]
  } catch (err) {
    console.error('[rl-cart] AI batch match failed, using first-candidate fallback:', String(err))
    return [
      ...notFoundResults,
      ...withCandidates.map(item =>
        firstCandidateResult(item, candidateMap.get(item.id)!, `AI fallback (${String(err).slice(0, 40)})`),
      ),
    ]
  }
}

function firstCandidateResult(
  item: { id: string; text: string; quantity: string | null },
  candidates: Candidate[],
  note: string,
): CartItem {
  const c = candidates[0]
  return {
    itemId: item.id, itemText: item.text, quantity: item.quantity,
    status: 'substituted', fromMemory: false,
    rlProductId: c.product.id,
    rlProductName: c.product.name,
    rlProductUrl: c.url,
    rlProductImage: c.image,
    rlProductPrice: c.price,
    rlProductBrand: c.brand,
    rlProductContent: c.content,
    searchQuery: normalizeKey(item.text), candidatesCount: candidates.length,
    note,
  }
}
