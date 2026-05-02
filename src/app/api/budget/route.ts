import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ollamaChat } from '@/lib/ollama'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const householdId = member?.household_id ?? null

  // Get current month expenses
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const prevMonthStart = new Date(monthStart)
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1)
  const prevMonthEnd = new Date(monthStart)
  prevMonthEnd.setDate(0) // last day of previous month

  const admin = createAdminClient()
  const [expensesRes, categoriesRes, prevRes, budgetLimitRes] = await Promise.all([
    householdId
      ? supabase.from('budget_expenses').select('*, budget_categories(name, icon)').eq('household_id', householdId).gte('expense_date', monthStart.toISOString().split('T')[0]).order('expense_date', { ascending: false })
      : supabase.from('budget_expenses').select('*, budget_categories(name, icon)').eq('user_id', user.id).is('household_id', null).gte('expense_date', monthStart.toISOString().split('T')[0]).order('expense_date', { ascending: false }),
    householdId
      ? supabase.from('budget_categories').select('*').eq('household_id', householdId).order('name')
      : supabase.from('budget_categories').select('*').is('household_id', null).order('name'),
    householdId
      ? supabase.from('budget_expenses').select('amount').eq('household_id', householdId).gte('expense_date', prevMonthStart.toISOString().split('T')[0]).lte('expense_date', prevMonthEnd.toISOString().split('T')[0])
      : supabase.from('budget_expenses').select('amount').eq('user_id', user.id).is('household_id', null).gte('expense_date', prevMonthStart.toISOString().split('T')[0]).lte('expense_date', prevMonthEnd.toISOString().split('T')[0]),
    householdId
      ? admin.from('bot_memory').select('value').eq('household_id', householdId).eq('key', 'budget_limit').maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const prevTotal = (prevRes.data ?? []).reduce((s, e: { amount: number }) => s + Number(e.amount), 0)
  const budgetLimit = (budgetLimitRes.data as { value?: string } | null)?.value
    ? Number((budgetLimitRes.data as { value: string }).value)
    : null

  return NextResponse.json({
    expenses: expensesRes.data ?? [],
    categories: categoriesRes.data ?? [],
    prevMonthTotal: prevTotal,
    budgetLimit,
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const householdId = member?.household_id ?? null

  if (action === 'add_expense') {
    const { amount, description, category_id, expense_date } = body
    const { data, error } = await supabase
      .from('budget_expenses')
      .insert({
        amount: Number(amount),
        description,
        category_id: category_id || null,
        expense_date: expense_date || new Date().toISOString().split('T')[0],
        user_id: user.id,
        household_id: householdId,
      })
      .select('*, budget_categories(name, icon)')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  if (action === 'delete_expense') {
    const { id } = body
    await supabase.from('budget_expenses').delete().eq('id', id)
    return NextResponse.json({ success: true })
  }

  if (action === 'parse_text') {
    const { text } = body
    if (!text?.trim()) return NextResponse.json({ error: 'טקסט חסר' }, { status: 400 })

    try {
      const raw = await ollamaChat(
        [
          {
            role: 'system',
            content: `אתה עוזר לניתוח דפי חשבון של בנקים וכרטיסי אשראי ישראלים.
חלץ עסקאות הוצאה מהטקסט והחזר JSON בלבד.

כללים:
- כלול רק הוצאות (לא הכנסות, לא העברות בין חשבונות, לא חיובים עתידיים)
- category_hint: food, transport, health, utilities, shopping, entertainment, education, dining, home, other
- amount: מספר חיובי (ללא סימן מינוס)
- date: YYYY-MM-DD (אם לא ברור — השתמש בתאריך היום)
- description: שם העסק/ההוצאה בעברית

החזר JSON בלבד: [{"date":"YYYY-MM-DD","amount":number,"description":"string","category_hint":"string"}]`,
          },
          {
            role: 'user',
            content: `נתח את דף החשבון הבא וחלץ עסקאות:\n\n${text.slice(0, 4000)}`,
          },
        ],
        { maxTokens: 1200, timeoutMs: 10000 },
      )
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return NextResponse.json({ items: [] })

      const items = JSON.parse(jsonMatch[0]) as { date: string; amount: number; description: string; category_hint: string }[]
      return NextResponse.json({ items })
    } catch (err) {
      console.error('[budget/parse_text]', String(err))
      return NextResponse.json({ error: 'שגיאה בניתוח הטקסט' }, { status: 500 })
    }
  }

  if (action === 'add_category') {
    const { name, icon, monthly_limit } = body
    const { data, error } = await supabase
      .from('budget_categories')
      .insert({
        name, icon: icon || '💰',
        monthly_limit: monthly_limit ? Number(monthly_limit) : null,
        household_id: householdId,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
