/**
 * GET /api/bot/budget  — monthly summary for the current month
 * POST /api/bot/budget — add an expense
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../_auth'

export async function GET(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

  const { data: expenses } = await admin
    .from('budget_expenses')
    .select('amount, description, expense_date, budget_categories(name, icon)')
    .eq('household_id', auth.householdId)
    .gte('expense_date', monthStart)
    .order('expense_date', { ascending: false })

  if (!expenses?.length) return NextResponse.json({ total: 0, expenses: [], month: monthStart })

  const total = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0)

  // Group by category
  const byCategory: Record<string, number> = {}
  for (const e of expenses) {
    const cat = (e.budget_categories as { name?: string } | null)?.name ?? 'כללי'
    byCategory[cat] = (byCategory[cat] ?? 0) + (e.amount ?? 0)
  }

  return NextResponse.json({
    total: Math.round(total),
    month: monthStart,
    by_category: byCategory,
    recent: expenses.slice(0, 5).map(e => ({
      amount: e.amount,
      description: e.description,
      date: e.expense_date,
      category: (e.budget_categories as { name?: string } | null)?.name ?? 'כללי',
    })),
  })
}

// Keyword → category hint mapping for auto-detection
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food:          ['סופר', 'שופרסל', 'רמי לוי', 'מגה', 'יינות ביתן', 'אושר עד', 'מזון', 'אוכל', 'ירקות', 'פירות', 'לחם', 'בשר', 'עוף', 'דגים'],
  dining:        ['מסעדה', 'קפה', 'בית קפה', 'פיצה', 'סושי', 'המבורגר', 'שווארמה', 'פלאפל', 'מאפייה', 'אייס', 'גלידה'],
  transport:     ['דלק', 'פז', 'סונול', 'דור אלון', 'תחנת דלק', 'חניה', 'רכבת', 'אוטובוס', 'מונית', 'אובר', 'גט', 'רב קו'],
  health:        ['בית מרקחת', 'סופר-פארם', 'כללית', 'מכבי', 'מאוחדת', 'לאומית', 'רופא', 'תרופות', 'שיניים', 'אופטיקה'],
  utilities:     ['חשמל', 'מים', 'גז', 'אינטרנט', 'פלאפון', 'סלקום', 'הוט', 'בזק', 'ועד בית', 'ארנונה'],
  shopping:      ['זארה', 'H&M', 'אדידס', 'נייקי', 'מחשב', 'נייד', 'אלקטרוניקה', 'ריהוט', 'איקאה', 'קניון'],
  entertainment: ['קולנוע', 'תיאטרון', 'ספרים', 'נטפליקס', 'ספוטיפיי', 'חדר כושר', 'ספורט', 'משחק', 'אפליקציה'],
  education:     ['שיעורים', 'קורס', 'אוניברסיטה', 'בית ספר', 'גן', 'עמלה', 'ספר לימוד'],
  home:          ['שיפוץ', 'חשמלאי', 'אינסטלטור', 'ניקיון', 'תיקון', 'נגר', 'מנעולן'],
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
    amount?: number | string
    description?: string
    category_name?: string
    expense_date?: string
  }

  const amount = Number(body.amount)
  const description = body.description?.trim()

  if (!amount || amount <= 0) return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  if (!description) return NextResponse.json({ error: 'חסר תיאור' }, { status: 400 })

  const admin = createAdminClient()

  // Resolve category_id: try by name first, then by keyword hint
  let category_id: string | null = null
  const { data: categories } = await admin
    .from('budget_categories')
    .select('id, name')
    .eq('household_id', auth.householdId)

  if (categories?.length) {
    // 1. Exact name match (case-insensitive)
    const nameToFind = (body.category_name ?? '').trim().toLowerCase()
    if (nameToFind) {
      const found = categories.find(c => c.name.toLowerCase() === nameToFind)
      if (found) category_id = found.id
    }

    // 2. Auto-detect by description keywords → hint → category name match
    if (!category_id) {
      const hint = guessCategory(description)
      if (hint) {
        const found = categories.find(c =>
          c.name.toLowerCase().includes(hint) ||
          hint.includes(c.name.toLowerCase())
        )
        if (found) category_id = found.id
      }
    }
  }

  const expense_date = body.expense_date ?? new Date().toISOString().split('T')[0]

  const { data, error } = await admin
    .from('budget_expenses')
    .insert({
      amount,
      description,
      category_id,
      expense_date,
      household_id: auth.householdId,
    })
    .select('id, amount, description, expense_date, budget_categories(name, icon)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cat = (data.budget_categories as { name?: string; icon?: string } | null)
  console.log(`[bot/budget] added ₪${amount} "${description}" cat=${cat?.name ?? 'none'} household=${auth.householdId}`)

  return NextResponse.json({
    id: data.id,
    amount: data.amount,
    description: data.description,
    date: data.expense_date,
    category: cat?.name ?? null,
    category_icon: cat?.icon ?? null,
  })
}
