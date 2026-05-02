/**
 * POST /api/bot/receipts — Scan a receipt image and save as a budget expense.
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 *
 * Body:
 *   imageBase64   string   — base64-encoded image (JPEG/PNG/WEBP)
 *   mediaType     string?  — "image/jpeg" | "image/png" | "image/webp" (default: "image/jpeg")
 *   description   string?  — optional override for the expense description
 *   expense_date  string?  — ISO date (YYYY-MM-DD), defaults to today
 *
 * Returns: parsed receipt data + saved expense id
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../_auth'
import { ollamaChat } from '@/lib/ollama'

export const maxDuration = 30

interface ReceiptItem {
  name: string
  price: number
  quantity?: string
}

interface ParsedReceipt {
  store: string | null
  date: string | null
  total: number | null
  items: ReceiptItem[]
  currency: string
}

async function parseReceiptWithVision(imageBase64: string, _mediaType: string): Promise<ParsedReceipt> {
  const text = await ollamaChat(
    [
      {
        role: 'user',
        content: `Parse this receipt image. Return ONLY valid JSON in this exact format:
{
  "store": "store name or null",
  "date": "YYYY-MM-DD or null",
  "total": 123.45 or null,
  "currency": "ILS",
  "items": [
    { "name": "item name", "price": 12.50, "quantity": "2x or null" }
  ]
}

Rules:
- total should be the final total paid (including VAT, after discounts)
- If you can't determine a value, use null
- items should be individual product lines
- prices in ILS (₪)
- Return ONLY the JSON object, no other text`,
        images: [imageBase64],
      },
    ],
    { maxTokens: 1024 },
  )

  // Extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in response')

  return JSON.parse(jsonMatch[0]) as ParsedReceipt
}

// Keyword → category hint mapping (same as budget route)
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food:          ['סופר', 'שופרסל', 'רמי לוי', 'מגה', 'יינות ביתן', 'אושר עד', 'מזון', 'אוכל', 'ירקות', 'פירות', 'לחם', 'בשר', 'עוף', 'דגים'],
  dining:        ['מסעדה', 'קפה', 'בית קפה', 'פיצה', 'סושי', 'המבורגר', 'שווארמה', 'פלאפל', 'מאפייה'],
  transport:     ['דלק', 'פז', 'סונול', 'דור אלון', 'תחנת דלק', 'חניה', 'רכבת', 'אוטובוס'],
  health:        ['בית מרקחת', 'סופר-פארם', 'כללית', 'מכבי', 'מאוחדת', 'לאומית', 'רופא', 'תרופות'],
  utilities:     ['חשמל', 'מים', 'גז', 'אינטרנט', 'פלאפון', 'סלקום', 'הוט', 'בזק'],
  shopping:      ['זארה', 'H&M', 'אדידס', 'נייקי', 'מחשב', 'נייד', 'אלקטרוניקה', 'ריהוט', 'איקאה'],
}

function guessCategory(description: string): string | null {
  const lower = description.toLowerCase()
  for (const [hint, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) return hint
  }
  return null
}

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    imageBase64?: string
    mediaType?: string
    description?: string
    expense_date?: string
  }

  if (!body.imageBase64?.trim()) {
    return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 })
  }

  const mediaType = body.mediaType ?? 'image/jpeg'

  // Parse receipt with Claude Vision
  let receipt: ParsedReceipt
  try {
    receipt = await parseReceiptWithVision(body.imageBase64, mediaType)
  } catch (err) {
    console.error('[bot/receipts] vision parse failed:', String(err))
    return NextResponse.json({ error: 'Failed to parse receipt: ' + String(err) }, { status: 500 })
  }

  const total = receipt.total
  if (!total || total <= 0) {
    return NextResponse.json({
      ok: false,
      error: 'Could not determine receipt total',
      parsed: receipt,
    }, { status: 422 })
  }

  // Build description: store name or fallback
  const description = body.description?.trim()
    || (receipt.store ? `קנייה ב${receipt.store}` : 'קנייה')

  const expense_date = body.expense_date
    || receipt.date
    || new Date().toISOString().split('T')[0]

  const admin = createAdminClient()

  // Resolve category
  let category_id: string | null = null
  const { data: categories } = await admin
    .from('budget_categories')
    .select('id, name')
    .eq('household_id', auth.householdId)

  if (categories?.length) {
    const hint = guessCategory(description)
    if (hint) {
      const found = categories.find(c =>
        c.name.toLowerCase().includes(hint) || hint.includes(c.name.toLowerCase())
      )
      if (found) category_id = found.id
    }
    // Default to food if store looks like a supermarket
    if (!category_id && receipt.store) {
      const isSupermarket = ['סופר', 'שופרסל', 'רמי', 'מגה', 'יינות', 'אושר'].some(
        k => receipt.store!.includes(k)
      )
      if (isSupermarket) {
        const food = categories.find(c => c.name.toLowerCase().includes('מזון') || c.name.toLowerCase().includes('food') || c.name.toLowerCase().includes('קניות'))
        if (food) category_id = food.id
      }
    }
  }

  const { data: expense, error } = await admin
    .from('budget_expenses')
    .insert({
      amount: Math.round(total * 100) / 100,
      description,
      category_id,
      expense_date,
      household_id: auth.householdId,
    })
    .select('id, amount, description, expense_date, budget_categories(name, icon)')
    .single()

  if (error) {
    console.error('[bot/receipts] expense insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const cat = expense.budget_categories as { name?: string; icon?: string } | null
  console.log(`[bot/receipts] saved ₪${total} "${description}" store="${receipt.store}" items=${receipt.items.length} household=${auth.householdId}`)

  return NextResponse.json({
    ok: true,
    expense_id: expense.id,
    amount: expense.amount,
    description: expense.description,
    date: expense.expense_date,
    category: cat?.name ?? null,
    parsed: {
      store: receipt.store,
      date: receipt.date,
      total: receipt.total,
      items_count: receipt.items.length,
      items: receipt.items.slice(0, 10), // return up to 10 items in response
    },
  })
}
