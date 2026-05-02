import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'

export default async function MorePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).maybeSingle()
  const householdId = member?.household_id ?? null
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

  const now2 = new Date().toISOString()
  const [budgetRes, providersRes, leaderRes, recipesRes, membersRes, bulletinRes] = await Promise.all([
    householdId ? supabase.from('budget_expenses').select('amount').eq('household_id', householdId).gte('expense_date', monthStart.toISOString().split('T')[0]) : supabase.from('budget_expenses').select('amount').eq('user_id', user.id).is('household_id', null).gte('expense_date', monthStart.toISOString().split('T')[0]),
    householdId ? supabase.from('service_providers').select('id', { count: 'exact', head: true }).eq('household_id', householdId) : supabase.from('service_providers').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    householdId ? supabase.from('task_logs').select('done_by').gte('done_at', monthStart.toISOString()) : Promise.resolve({ data: [] }),
    householdId ? supabase.from('recipes').select('id', { count: 'exact', head: true }).eq('household_id', householdId) : supabase.from('recipes').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    // Fetch members in parallel so we can resolve display names without a sequential round-trip
    householdId ? supabase.from('household_members').select('user_id, display_name').eq('household_id', householdId) : Promise.resolve({ data: [] }),
    householdId ? supabase.from('bulletin_posts').select('id', { count: 'exact', head: true }).eq('household_id', householdId).or(`expires_at.is.null,expires_at.gt.${now2}`) : Promise.resolve({ count: 0 }),
  ])

  const budgetTotal = (budgetRes.data ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0)

  // Resolve top contributor name using in-memory member data — no extra DB round-trip
  const memberMap = new Map(((membersRes.data ?? []) as { user_id: string; display_name: string }[]).map(m => [m.user_id, m.display_name]))
  const logCounts = new Map<string, number>()
  for (const l of ((leaderRes.data ?? []) as { done_by: string }[])) {
    logCounts.set(l.done_by, (logCounts.get(l.done_by) ?? 0) + 1)
  }
  const topUserId = [...logCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const leaderName = topUserId ? (memberMap.get(topUserId) ?? '') : ''

  const bulletinCount = (bulletinRes as { count: number | null }).count ?? 0

  const items = [
    { href: '/leaderboard', icon: '🏆', label: 'דירוגים', desc: leaderName ? `מוביל: ${leaderName}` : 'נקודות חודשיות' },
    { href: '/budget', icon: '💰', label: 'תקציב', desc: budgetTotal > 0 ? `₪${Math.round(budgetTotal).toLocaleString('he-IL')} החודש` : 'הוצאות הבית' },
    { href: '/providers', icon: '🔧', label: 'ספקים', desc: providersRes.count ? `${providersRes.count} ספקים` : 'אנשי מקצוע' },
    { href: '/recipes', icon: '🍳', label: 'מתכונים', desc: recipesRes.count ? `${recipesRes.count} מתכונים` : 'ספר מתכונים' },
    { href: '/bulletin', icon: '📌', label: 'לוח מודעות', desc: bulletinCount > 0 ? `${bulletinCount} הודעות פעילות` : 'הודעות למשק הבית' },
    { href: '/memory', icon: '🧠', label: 'זיכרון בוב', desc: 'עובדות ששמרת לבוב' },
  ]

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-lg mx-auto px-4 pt-7 pb-nav page-in">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">עוד</h1>

        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">כלים</p>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
          {items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 px-4 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 active:bg-zinc-100 dark:active:bg-zinc-700 transition-colors duration-150"
            >
              <span className="text-2xl w-10 h-10 flex items-center justify-center bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700 flex-shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.label}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{item.desc}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300 dark:text-zinc-600 flex-shrink-0">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
