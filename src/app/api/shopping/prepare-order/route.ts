import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { ollamaChat, ollamaAvailable } from '@/lib/ollama'
import { lookupCatalog, type CatalogProduct } from '@/lib/supermarket/rl-catalog'
import { search as offSearch, getProductUrl as offProductUrl, type OFFProduct } from '@/lib/supermarket/open-food-facts'
import { lookupPriceILS } from '@/lib/supermarket/open-prices'
import { hebrewToEnglish } from '@/lib/supermarket/he-en-grocery'
import type { OrderLine, PreparedOrder, ShoppingInput } from '@/lib/supermarket/types'

// Hebrew terms that signal "obviously wrong" processed/specialty products
// when the user searched for a basic staple
const PENALTY_HE = [/מרוכז/, /ממותק/, /שתייה/, /בתוספת שומן צמחי/, /ברסק/, /מיובש/, /מוכן לאכילה/]
const PENALTY_EN = [/condensed/i, /sweetened/i, /dried/i, /flavored/i, /flavoured/i, /drink mix/i]

function isPenalized(name: string): boolean {
  return PENALTY_HE.some(r => r.test(name)) || PENALTY_EN.some(r => r.test(name))
}

interface ItemDebug {
  text: string
  query: string
  match_strategy: 'catalog' | 'off' | 'missing'
  provider_status: string
  retry_count: number
  candidates_found: number
  top_candidate_names: string[]
  penalized_candidates: string[]
  price_hit: boolean
  ai_status: string | null
  missing_reason: string | null
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 1. Load pending shopping items ─────────────────────────────────────────
  const { data: member } = await supabase
    .from('household_members').select('household_id').eq('user_id', user.id).maybeSingle()
  const householdId = member?.household_id ?? null

  const baseQuery = supabase
    .from('shopping_items')
    .select('id, text, quantity')
    .eq('done', false)
    .order('created_at', { ascending: false })

  const { data: rawItems, error } = householdId
    ? await baseQuery.eq('household_id', householdId)
    : await baseQuery.eq('user_id', user.id).is('household_id', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rawItems?.length) return NextResponse.json({ error: 'הרשימה ריקה — אין פריטים להכין' }, { status: 400 })

  const items: ShoppingInput[] = rawItems.map(r => ({
    id: r.id as string,
    text: r.text as string,
    quantity: (r.quantity as string | null) ?? null,
  }))

  console.log(`[prepare-order] PREPARATION_STARTED items=${items.length} user=${user.id}`)

  // ── 2. Phase A: catalog lookup (instant, no network) ───────────────────────
  const debugPerItem: ItemDebug[] = items.map(i => ({
    text: i.text, query: i.text,
    match_strategy: 'missing', provider_status: 'pending',
    retry_count: 0, candidates_found: 0,
    top_candidate_names: [], penalized_candidates: [],
    price_hit: false, ai_status: null, missing_reason: null,
  }))

  // Separate items into catalog hits and OFF-needed
  type CatalogHit = { idx: number; products: CatalogProduct[] }
  type OFFNeeded = { idx: number; query: string }

  const catalogHits: CatalogHit[] = []
  const offNeeded: OFFNeeded[] = []

  for (let i = 0; i < items.length; i++) {
    const catalogProducts = lookupCatalog(items[i].text)
    if (catalogProducts.length) {
      catalogHits.push({ idx: i, products: catalogProducts })
      debugPerItem[i].match_strategy = 'catalog'
      debugPerItem[i].provider_status = 'catalog_hit'
      debugPerItem[i].candidates_found = catalogProducts.length
      debugPerItem[i].top_candidate_names = catalogProducts.slice(0, 3).map(p => p.name)
      console.log(`[prepare-order] SEARCH_PROVIDER_SELECTED item="${items[i].text}" strategy=catalog candidates=${catalogProducts.length}`)
    } else {
      const enQuery = hebrewToEnglish(items[i].text) ?? items[i].text
      offNeeded.push({ idx: i, query: enQuery })
      debugPerItem[i].query = enQuery
      console.log(`[prepare-order] SEARCH_PROVIDER_SELECTED item="${items[i].text}" strategy=off query="${enQuery}"`)
    }
  }

  // ── 3. Phase B: OFF search for non-catalog items (staggered, max 3 concurrent) ──
  type OFFResult = { idx: number; products: OFFProduct[]; priceILS: number | null }
  const offResults: OFFResult[] = []

  if (offNeeded.length > 0) {
    const STAGGER_MS = 150
    await Promise.all(
      offNeeded.map(async ({ idx, query }, position) => {
        if (position > 0) await new Promise(r => setTimeout(r, position * STAGGER_MS))

        const result = await offSearch(query)
        debugPerItem[idx].retry_count = result.retryCount
        debugPerItem[idx].provider_status = result.providerStatus

        // Filter penalized candidates before AI sees them
        const good: OFFProduct[] = []
        const penalized: string[] = []
        for (const p of result.products) {
          if (isPenalized(p.name)) penalized.push(p.name)
          else good.push(p)
        }
        debugPerItem[idx].candidates_found = good.length
        debugPerItem[idx].top_candidate_names = good.slice(0, 3).map(p => p.name)
        debugPerItem[idx].penalized_candidates = penalized

        if (penalized.length) {
          console.log(`[prepare-order] penalized_candidates item="${items[idx].text}" count=${penalized.length}: ${penalized.slice(0, 2).join(', ')}`)
        }

        if (result.error) {
          console.error(`[prepare-order] search_error item="${items[idx].text}" err="${result.error}"`)
        }

        // Price lookup for top candidate
        let priceILS: number | null = null
        if (good.length > 0) {
          const { priceILS: p } = await lookupPriceILS(good[0].barcode)
          priceILS = p
          if (priceILS != null) {
            debugPerItem[idx].price_hit = true
            console.log(`[prepare-order] PRICE_LOOKUP_HIT item="${items[idx].text}" barcode=${good[0].barcode} price=${priceILS}₪`)
          } else {
            console.log(`[prepare-order] PRICE_LOOKUP_MISS item="${items[idx].text}" barcode=${good[0].barcode}`)
          }
        }

        offResults.push({ idx, products: good, priceILS })
      })
    )
  }

  // ── 4. Build lines for catalog hits (no AI needed) ──────────────────────────
  const lines: (OrderLine | null)[] = new Array(items.length).fill(null)

  for (const { idx, products } of catalogHits) {
    const item = items[idx]
    const p = products[0]
    debugPerItem[idx].ai_status = 'catalog_exact'
    console.log(`[prepare-order] FINAL_MATCH_RESULT item="${item.text}" product="${p.name}" strategy=catalog price=${p.price}₪`)
    lines[idx] = {
      itemId: item.id, itemText: item.text, quantity: item.quantity,
      status: 'matched', note: null,
      product: {
        retailerId: p.url.split('/').pop() ?? p.name,
        name: p.name, brand: p.brand, contentText: p.contentText,
        price: p.price, imageUrl: p.imageUrl, url: p.url,
      },
    }
  }

  // ── 5. AI matching for OFF results ──────────────────────────────────────────
  const offNeedingAI = offResults.filter(r => r.products.length > 0)
  const offMissing = offResults.filter(r => r.products.length === 0)

  // Mark no-candidate OFF items as missing immediately
  for (const { idx } of offMissing) {
    const item = items[idx]
    const d = debugPerItem[idx]
    d.missing_reason = d.provider_status === 'unavailable' ? 'provider_unavailable' : 'no_candidates_after_filter'
    console.log(`[prepare-order] MISSING_REASON item="${item.text}" reason=${d.missing_reason}`)
    lines[idx] = { itemId: item.id, itemText: item.text, quantity: item.quantity, status: 'missing', product: null, note: null }
  }

  // Run AI match for items with OFF candidates
  if (offNeedingAI.length > 0) {
    const aiLines = await matchWithAI(items, offNeedingAI, debugPerItem)
    for (const [idx, line] of aiLines) {
      lines[idx] = line
    }
  }

  // Any remaining nulls (shouldn't happen) → missing
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) {
      lines[i] = { itemId: items[i].id, itemText: items[i].text, quantity: items[i].quantity, status: 'missing', product: null, note: null }
    }
  }

  const finalLines = lines as OrderLine[]

  // ── 6. Build response ───────────────────────────────────────────────────────
  const priceSum = finalLines.reduce((sum, l) => {
    if (!l.product?.price) return sum
    return sum + l.product.price * parseQtyMultiplier(l.quantity)
  }, 0)

  const matched = finalLines.filter(l => l.status === 'matched').length
  const substituted = finalLines.filter(l => l.status === 'substituted').length
  const missing = finalLines.filter(l => l.status === 'missing').length

  console.log(`[prepare-order] CART_READY matched=${matched} substituted=${substituted} missing=${missing}`)

  // ── 7. Save shopping history snapshot (fire-and-forget) ────────────────────
  const historyItems = rawItems.map((r: { text: string; quantity: string | null }) => ({
    text: r.text,
    quantity: r.quantity ?? null,
  }))
  void supabase
    .from('shopping_history')
    .insert({ user_id: user.id, household_id: householdId, items: historyItems })
    .then(({ error: histErr }) => {
      if (histErr) console.error('[prepare-order] history_save_error', histErr.message)
      else console.log(`[prepare-order] history_saved count=${historyItems.length}`)
    })

  const result: PreparedOrder & { debug: ItemDebug[] } = {
    retailer: 'rami-levy',
    retailerName: 'רמי לוי',
    retailerUrl: 'https://www.rami-levy.co.il',
    lines: finalLines,
    estimatedTotal: priceSum > 0 ? Math.round(priceSum * 100) / 100 : null,
    preparedAt: new Date().toISOString(),
    debug: debugPerItem,
  }

  return NextResponse.json(result)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseQtyMultiplier(qty: string | null): number {
  if (!qty) return 1
  const n = parseFloat(qty)
  return isNaN(n) || n <= 0 ? 1 : n
}

async function matchWithAI(
  items: ShoppingInput[],
  offResults: Array<{ idx: number; products: OFFProduct[]; priceILS: number | null }>,
  debugPerItem: ItemDebug[],
): Promise<Map<number, OrderLine>> {
  const resultMap = new Map<number, OrderLine>()

  try {
    // Build a map from original item index → position in offResults (the index AI will use)
    const itemIdxToAiIdx = new Map<number, number>()
    offResults.forEach(({ idx }, pos) => itemIdxToAiIdx.set(idx, pos))

    const itemBlocks = offResults.map(({ idx, products, priceILS }, aiIdx) => {
      const item = items[idx]
      const candidateLines = products.slice(0, 5).map((p, j) => {
        const price = j === 0 && priceILS != null ? `${priceILS}₪` : null
        const detail = [p.brand, p.quantity, price].filter(Boolean).join(' | ')
        return `  ${j}. "${p.name}"${detail ? ` (${detail})` : ''}`
      }).join('\n')
      return `[${aiIdx}] item="${item.text}"${item.quantity ? ` qty="${item.quantity}"` : ''}\n${candidateLines}`
    }).join('\n\n')

    let raw = ''

    if (ollamaAvailable()) {
      raw = await ollamaChat(
        [
          {
            role: 'system',
            content: `אתה עוזר להתאמת פריטי קניות למוצרים בסופר. החזר רק JSON תקין, ללא הסברים.

כללי התאמה חשובים:
- "matched" = מוצר תואם בדיוק לבקשה
- "substituted" = חלופה סבירה בלבד (עם הסבר קצר ב-note)
- "missing" = אין מועמד מתאים — עדיף "missing" על פני התאמה גרועה

חוקים נוקשים לפריטים בסיסיים:
- "חלב": רק חלב נוזלי רגיל (3%, 1%, מלא). לא חלב מרוכז/ממותק/בתוספת שומן צמחי/שתייה.
- "ביצים": רק ביצי עוף טריות. לא מוצרי ביצה מעובדים.
- "עגבניות": עדיף עגבניות טריות. לא רסק עגבניות/ריכוז/רוטב.
- "מיונז": מיונז רגיל בלבד. לא רטבים בטעמים/וינגרט.
- "בננות": בננות טריות בלבד. לא חטיפים/שייקים בטעם בננה.
- "לחם": לחם רגיל/פרוס. לא קרקרים/פיתות/לחמניות אלא אם התבקש.

כלל זהב: אם המוצר הטוב ביותר הוא עדיין לא מתאים לבקשה, החזר "missing".`,
        },
        {
          role: 'user',
          content: `התאם כל פריט מרשימת הקניות למוצר הטוב ביותר מהמועמדים.\n\nפריטים:\n${itemBlocks}\n\nהחזר JSON בלבד:\n[{"idx":0,"status":"matched","productIndex":0,"note":""},...]`,
        },
      ],
      { maxTokens: 900, timeoutMs: 8000 },
      ).catch(() => '')
    }

    if (!raw && process.env.ANTHROPIC_API_KEY) {
      const systemPrompt = `אתה עוזר להתאמת פריטי קניות למוצרים בסופר. החזר רק JSON תקין, ללא הסברים.\n\nכללי התאמה חשובים:\n- "matched" = מוצר תואם בדיוק לבקשה\n- "substituted" = חלופה סבירה בלבד (עם הסבר קצר ב-note)\n- "missing" = אין מועמד מתאים — עדיף "missing" על פני התאמה גרועה\n\nכלל זהב: אם המוצר הטוב ביותר הוא עדיין לא מתאים לבקשה, החזר "missing".`
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const response = await Promise.race<Anthropic.Message | never>([
        client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 900,
          system: systemPrompt,
          messages: [{ role: 'user', content: `התאם כל פריט מרשימת הקניות למוצר הטוב ביותר מהמועמדים.\n\nפריטים:\n${itemBlocks}\n\nהחזר JSON בלבד:\n[{"idx":0,"status":"matched","productIndex":0,"note":""},...]` }],
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ])
      raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    }

    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('[prepare-order] AI response had no JSON array, raw:', raw.slice(0, 200))
      return fallbackOFFLines(items, offResults, debugPerItem)
    }

    interface AIMatch { idx: number; status: string; productIndex: number | null; note: string }
    const aiMatches: AIMatch[] = JSON.parse(jsonMatch[0])

    for (const { idx: itemIdx, products, priceILS } of offResults) {
      const item = items[itemIdx]
      const aiIdx = itemIdxToAiIdx.get(itemIdx) ?? -1
      const m = aiMatches.find(x => x.idx === aiIdx)
      debugPerItem[itemIdx].ai_status = m?.status ?? 'no_ai_entry'
      debugPerItem[itemIdx].match_strategy = 'off'

      if (!m || m.status === 'missing' || m.productIndex == null) {
        const reason = !m ? 'ai_no_entry' : 'ai_marked_missing'
        debugPerItem[itemIdx].missing_reason = reason
        console.log(`[prepare-order] MISSING_REASON item="${item.text}" reason=${reason}`)
        resultMap.set(itemIdx, { itemId: item.id, itemText: item.text, quantity: item.quantity, status: 'missing', product: null, note: null })
        continue
      }

      const product = products[m.productIndex] ?? products[0]
      if (!product) {
        debugPerItem[itemIdx].missing_reason = 'candidate_index_invalid'
        resultMap.set(itemIdx, { itemId: item.id, itemText: item.text, quantity: item.quantity, status: 'missing', product: null, note: null })
        continue
      }

      const price = m.productIndex === 0 ? priceILS : null
      const status: OrderLine['status'] = m.status === 'substituted' ? 'substituted' : 'matched'
      console.log(`[prepare-order] FINAL_MATCH_RESULT item="${item.text}" product="${product.name}" status=${status} price=${price ?? 'N/A'}`)
      resultMap.set(itemIdx, buildOFFLine(item, product, price, status, m.note || null))
    }

    return resultMap
  } catch (err) {
    console.error('[prepare-order] AI matching failed, using fallback:', String(err))
    return fallbackOFFLines(items, offResults, debugPerItem)
  }
}

function fallbackOFFLines(
  items: ShoppingInput[],
  offResults: Array<{ idx: number; products: OFFProduct[]; priceILS: number | null }>,
  debugPerItem: ItemDebug[],
): Map<number, OrderLine> {
  const map = new Map<number, OrderLine>()
  for (const { idx, products, priceILS } of offResults) {
    const item = items[idx]
    debugPerItem[idx].ai_status = 'fallback'
    debugPerItem[idx].match_strategy = 'off'
    const p = products[0]
    console.log(`[prepare-order] FINAL_MATCH_RESULT item="${item.text}" product="${p.name}" strategy=fallback price=${priceILS ?? 'N/A'}`)
    map.set(idx, buildOFFLine(item, p, priceILS, 'matched', null))
  }
  return map
}

function buildOFFLine(
  item: ShoppingInput,
  product: OFFProduct,
  price: number | null,
  status: OrderLine['status'],
  note: string | null,
): OrderLine {
  return {
    itemId: item.id, itemText: item.text, quantity: item.quantity,
    status, note,
    product: {
      retailerId: product.barcode,
      name: product.name, brand: product.brand,
      contentText: product.quantity,
      price,
      imageUrl: product.imageUrl,
      url: offProductUrl(product.barcode),
    },
  }
}
