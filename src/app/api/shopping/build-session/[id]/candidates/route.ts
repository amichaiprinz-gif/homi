/**
 * POST /api/shopping/build-session/[id]/candidates
 *
 * CORS-enabled — called by the bookmarklet after it finishes searching RL.
 *
 * Body: {
 *   items: { text: string; quantity: string | null }[]
 *   candidates: Record<itemText, { id, name, price, brand, content }[]>
 * }
 *
 * Runs Claude Haiku to pick the best match per item, then returns
 * MatchedItem[] synchronously so the bookmarklet can show the preview.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ollamaChat } from '@/lib/ollama'
import type { SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 60

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.rami-levy.co.il',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface BookmarkletCandidate {
  id: number
  name: string
  price: number | null
  brand: string | null
  content: string | null
}

export interface MatchedItem {
  itemText: string
  quantity: string | null
  status: 'matched' | 'substituted' | 'not_found'
  rlProductId: number | null
  rlProductName: string | null
  rlProductPrice: number | null
  note: string | null
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Validate session exists and hasn't expired
  const admin = createAdminClient()
  const { data: session } = await admin
    .from('rl_build_sessions')
    .select('id, expires_at, household_id')
    .eq('id', id)
    .maybeSingle()

  if (!session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404, headers: CORS_HEADERS },
    )
  }
  if (new Date(session.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'Session expired' },
      { status: 410, headers: CORS_HEADERS },
    )
  }

  const body = await req.json().catch(() => ({})) as {
    items?: { text: string; quantity: string | null }[]
    candidates?: Record<string, BookmarkletCandidate[]>
  }

  const items = body.items ?? []
  const candidatesMap = body.candidates ?? {}

  if (!items.length) {
    return NextResponse.json(
      { error: 'No items' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  console.log(`[build-session/candidates] session=${id} items=${items.length}`)

  // Load household product preferences to improve matching
  const prefs = session.household_id
    ? await loadPreferences(admin, session.household_id)
    : []

  const matched = await matchWithAI(items, candidatesMap, prefs)

  // Mark session done
  await admin
    .from('rl_build_sessions')
    .update({ status: 'done' })
    .eq('id', id)

  console.log(`[build-session/candidates] done matched=${matched.filter(m => m.status !== 'not_found').length}/${matched.length}`)

  return NextResponse.json(matched, { headers: CORS_HEADERS })
}

// ── Preference loading ────────────────────────────────────────────────────────

interface Preference {
  item_text: string
  rl_product_id: number
  rl_product_name: string | null
  feedback: 'good' | 'bad'
}

async function loadPreferences(
  admin: SupabaseClient,
  householdId: string,
): Promise<Preference[]> {
  const { data, error } = await admin
    .from('rl_product_preferences')
    .select('item_text, rl_product_id, rl_product_name, feedback')
    .eq('household_id', householdId)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) {
    console.warn('[build-session/candidates] failed to load prefs:', error.message)
    return []
  }
  return (data ?? []) as Preference[]
}

function buildPrefsSection(
  prefs: Preference[],
  itemTexts: string[],
): string {
  if (!prefs.length) return ''

  // Only include prefs for items we're currently matching
  const relevant = prefs.filter(p =>
    itemTexts.some(t => t.trim().toLowerCase() === p.item_text.trim().toLowerCase())
  )
  if (!relevant.length) return ''

  const lines = relevant.map(p => {
    const mark = p.feedback === 'good' ? '✓' : '✗'
    const label = p.feedback === 'good' ? 'בחר בעבר' : 'דחה בעבר — אל תבחר'
    return `${mark} "${p.item_text}" → "${p.rl_product_name ?? p.rl_product_id}" (${label})`
  })

  return `\nהעדפות קודמות של המשתמש (יש לתעדף אותן):\n${lines.join('\n')}\n`
}

// ── AI matching ───────────────────────────────────────────────────────────────

async function matchWithAI(
  items: { text: string; quantity: string | null }[],
  candidatesMap: Record<string, BookmarkletCandidate[]>,
  prefs: Preference[] = [],
): Promise<MatchedItem[]> {
  const withCandidates = items.filter(i => (candidatesMap[i.text] ?? []).length > 0)
  const noCandidates   = items.filter(i => (candidatesMap[i.text] ?? []).length === 0)

  const notFound: MatchedItem[] = noCandidates.map(item => ({
    itemText: item.text,
    quantity: item.quantity,
    status: 'not_found',
    rlProductId: null,
    rlProductName: null,
    rlProductPrice: null,
    note: '\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0 \u05D1\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9', // לא נמצא ברמי לוי
  }))

  if (!withCandidates.length) return notFound


  // Build compact prompt for Claude
  const prefsSection = buildPrefsSection(prefs, withCandidates.map(i => i.text))
  const blocks = withCandidates.map((item, i) => {
    const candidates = candidatesMap[item.text] ?? []
    const lines = candidates.slice(0, 6).map((c, j) => {
      const parts: string[] = [c.name]
      if (c.brand)   parts.push(c.brand)
      if (c.content) parts.push(c.content)
      if (c.price != null) parts.push(`\u20AA${c.price}`)
      return `  ${j}. ${parts.join(' | ')}`
    })
    const qtyNote = item.quantity ? ` (\u05DB\u05DE\u05D5\u05EA: ${item.quantity})` : ''
    return `[${i}] "${item.text}"${qtyNote}\n${lines.join('\n')}`
  }).join('\n\n')

  try {
    const raw = await ollamaChat(
      [
        {
          role: 'system',
          content: `אתה מומחה להתאמת פריטי קניות למוצרים ברמי לוי ישראל.
לכל פריט, בחר את המוצר המתאים ביותר מהמועמדים.${prefsSection}

כללי ברזל — אסור לסטות מהם:
• ירקות ופירות טריים (עגבניות, מלפפון, גזר, תפוח וכו') — חייבים להיות טריים. אסור לבחור משומר/מרוסק/קפוא/מעובד. אין מועמד טרי = not_found.
• אחוז שומן (חלב, גבינה, שמנת, קוטג') — חייב להתאים בדיוק. 3% ≠ 1% ≠ 5% ≠ 9%.
• ביצים — ביצי עוף טריות בלבד. לא אומלט, לא תחליפי ביצה.
• לחם טרי ≠ קפוא ≠ לחם קרמבו. לחם מלא ≠ לחם לבן.
• אסור להחליף קטגוריות: אטריות ≠ אורז, קמח ≠ לחם, חמאה ≠ מרגרינה, חלב ≠ תחליף חלב.
• מוצר רגיל — לא דיאט/לייט/ללא סוכר, אלא אם צוין מפורשות.
• כמות שצוינה (2 ק"ג, 6 יח') = כמה לקנות, לא גודל אריזה.

סטטוסים:
• "matched" — המוצר תואם היטב לפי הכללים לעיל
• "substituted" — חלופה מאותה קטגוריה בדיוק, הבדל קל (גודל/מותג בלבד). note קצר בעברית.
• "not_found" — כשאין מועמד מאותה קטגוריה. עדיף not_found על substituted שגוי.

החזר JSON מערך בלבד, ללא טקסט נוסף:
[{"idx":0,"status":"matched","productIndex":0,"note":""},...]`,
        },
        {
          role: 'user',
          content: `התאם:\n\n${blocks}\n\nJSON בלבד:`,
        },
      ],
      { maxTokens: 1500, timeoutMs: 45000 },
    )
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('no JSON array in response')

    interface AIMatch { idx: number; status: string; productIndex: number | null; note: string }
    const aiMatches: AIMatch[] = JSON.parse(jsonMatch[0])

    const aiResults: MatchedItem[] = withCandidates.map((item, i) => {
      const candidates = candidatesMap[item.text] ?? []
      const m = aiMatches.find(x => x.idx === i)

      // AI explicitly said not_found — respect it, don't force a candidate
      if (m?.status === 'not_found') {
        return {
          itemText: item.text, quantity: item.quantity,
          status: 'not_found',
          rlProductId: null, rlProductName: null, rlProductPrice: null,
          note: 'לא נמצאה התאמה',
        }
      }
      // AI failed to return a result for this item — show first candidate as suggestion
      if (!m || m.productIndex == null) {
        if (candidates.length > 0) return firstCandidate(item, candidates, 'הצעה בלבד')
        return {
          itemText: item.text, quantity: item.quantity,
          status: 'not_found',
          rlProductId: null, rlProductName: null, rlProductPrice: null,
          note: 'לא נמצאה התאמה',
        }
      }

      const c = candidates[m.productIndex] ?? candidates[0]
      const status: 'matched' | 'substituted' = m.status === 'substituted' ? 'substituted' : 'matched'
      console.log(`[build-session/candidates] ${status} "${item.text}" → "${c.name}"`)

      return {
        itemText: item.text,
        quantity: item.quantity,
        status,
        rlProductId: c.id,
        rlProductName: c.name,
        rlProductPrice: c.price,
        note: m.note || null,
      }
    })

    return [...notFound, ...aiResults]
  } catch (err) {
    console.error('[build-session/candidates] AI failed:', String(err), '— using first-candidate fallback')
    return [...notFound, ...withCandidates.map(item => firstCandidate(item, candidatesMap[item.text]))]
  }
}

function firstCandidate(
  item: { text: string; quantity: string | null },
  candidates: BookmarkletCandidate[],
  note = '\u05D1\u05E8\u05D9\u05E8\u05EA \u05DE\u05D7\u05D3\u05DC',
): MatchedItem {
  const c = candidates[0]
  return {
    itemText: item.text,
    quantity: item.quantity,
    status: 'substituted',
    rlProductId: c.id,
    rlProductName: c.name,
    rlProductPrice: c.price,
    note,
  }
}
