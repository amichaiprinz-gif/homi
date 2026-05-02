'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { he } from 'date-fns/locale'
import BackButton from '@/components/BackButton'

interface LogItem { title: string; icon: string; done_at: string }
interface Entry { user_id: string; display_name: string; points: number; task_count: number; logs: LogItem[] }

const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

function PrevMonthBanner({ entries, prevMonth }: { entries: Entry[]; prevMonth: string }) {
  const [dismissed, setDismissed] = useState(false)
  const storageKey = `lb-prev-dismissed-${prevMonth}`

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(storageKey)) setDismissed(true)
  }, [storageKey])

  if (dismissed) return null
  const hasData = entries.some(e => e.points > 0)
  if (!hasData) return null

  const sorted = [...entries].sort((a, b) => b.points - a.points)
  const winner = sorted[0]
  const [year, month] = prevMonth.split('-')
  const monthLabel = MONTHS[Number(month) - 1] + ' ' + year

  function dismiss() {
    localStorage.setItem(storageKey, '1')
    setDismissed(true)
  }

  const MEDALS = ['🥇', '🥈', '🥉']

  return (
    <div className="bg-gradient-to-br from-amber-50 via-yellow-50/60 to-white dark:from-amber-950/30 dark:via-yellow-950/20 dark:to-zinc-900 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4 mb-5 relative overflow-hidden">
      <div className="absolute -top-4 -left-4 text-8xl opacity-[.05] select-none pointer-events-none">🏆</div>

      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-0.5">סיכום חודש קודם</p>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{monthLabel}</p>
        </div>
        <button onClick={dismiss} className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors duration-150 flex-shrink-0">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Winner highlight */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 border-2 border-amber-300 dark:border-amber-700 flex items-center justify-center text-amber-700 dark:text-amber-400 font-bold text-base flex-shrink-0">
          {winner.display_name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
            {winner.display_name} ניצח! 🏆
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{winner.points} נקודות · {winner.task_count} משימות</p>
        </div>
        <span className="text-2xl">{MEDALS[0]}</span>
      </div>

      {/* Podium rows */}
      {sorted.length > 1 && (
        <div className="space-y-1.5 border-t border-amber-100 dark:border-amber-900/30 pt-2.5">
          {sorted.slice(1).map((e, i) => (
            <div key={e.user_id} className="flex items-center gap-2.5">
              <span className="text-sm w-5 text-center flex-shrink-0">{MEDALS[i + 1] ?? `#${i + 2}`}</span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1 truncate">{e.display_name}</span>
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums flex-shrink-0">{e.points} נק׳</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Avatar({ name, size = 'md', className = '' }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const letter = name ? name[0] : '?'
  const sizes = { sm: 'w-8 h-8 text-sm', md: 'w-11 h-11 text-base', lg: 'w-14 h-14 text-xl' }
  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${className}`}>
      {letter}
    </div>
  )
}

function LogList({ logs }: { logs: LogItem[] }) {
  if (!logs.length) return (
    <p className="text-xs text-zinc-400 dark:text-zinc-500 py-2 text-center">אין משימות החודש עדיין</p>
  )
  return (
    <div className="mt-3 space-y-1 border-t border-zinc-100 dark:border-zinc-800 pt-3">
      {logs.map((l, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <span className="text-sm flex-shrink-0">{l.icon}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-1 truncate">{l.title}</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex-shrink-0 tabular-nums">
            {formatDistanceToNow(new Date(l.done_at), { locale: he, addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  )
}

interface Props {
  userId: string
  entries: Entry[]
  month: string
  daysRemaining: number | null
  noHousehold?: boolean
  prevEntries?: Entry[]
  prevMonth?: string
}

export default function LeaderboardClient({ userId, entries: initialEntries, month: initialMonth, daysRemaining: initialDaysRemaining, noHousehold = false, prevEntries = [], prevMonth = '' }: Props) {
  const [entries] = useState<Entry[]>(initialEntries)
  const [openId, setOpenId] = useState<string | null>(null)

  function toggle(id: string) { setOpenId(prev => prev === id ? null : id) }

  const month = initialMonth
  const daysRemaining = initialDaysRemaining

  const monthLabel = month ? MONTHS[Number(month.split('-')[1]) - 1] + ' ' + month.split('-')[0] : ''
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthPct = Math.round((now.getDate() / daysInMonth) * 100)
  const maxPoints = Math.max(...entries.map(e => e.points), 1)
  const hasPoints = entries.some(e => e.points > 0)
  const [first, second, third, ...rest] = entries

  return (
    <div className="max-w-lg mx-auto px-4 pt-7 pb-nav page-in">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">דירוגים</h1>
          {monthLabel && <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-0.5">{monthLabel}</p>}
        </div>
        <div className="flex items-center gap-3">
          {daysRemaining !== null && (
            <div className="text-right">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">{daysRemaining}</p>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">ימים נותרו</p>
            </div>
          )}
          <BackButton />
        </div>
      </div>

      {/* Month progress bar */}
      <div className="mb-6">
        <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-violet-200 dark:bg-violet-700/60 rounded-full transition-all duration-700" style={{ width: `${monthPct}%` }} />
        </div>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5 text-center">מתאפס אוטומטית ב-1 לחודש</p>
      </div>

      {/* Prev month recap banner */}
      {!noHousehold && prevEntries.length > 0 && prevMonth && (
        <PrevMonthBanner entries={prevEntries} prevMonth={prevMonth} />
      )}

      {noHousehold && (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🏠</p>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">הצטרף לבית כדי לראות את הניקוד</p>
        </div>
      )}

      {!noHousehold && entries.length === 0 && (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">אין נקודות עדיין החודש</p>
          <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1.5">השלם משימות כדי לצבור נקודות</p>
        </div>
      )}

      {entries.length > 0 && (
        <div className="space-y-3">

          {/* 1st place */}
          {first && (
            <div className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${
              hasPoints && first.points > 0
                ? 'bg-gradient-to-br from-amber-50 via-yellow-50/60 to-white dark:from-amber-950/30 dark:via-yellow-950/20 dark:to-zinc-900 border-amber-200 dark:border-amber-800/60'
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
            }`}>
              {first.points > 0 && (
                <div className="absolute -top-3 -left-3 text-7xl opacity-[.06] select-none pointer-events-none">🏆</div>
              )}
              <button type="button" className="w-full text-right" onClick={() => toggle(first.user_id)}>
                <div className="flex items-center gap-4 p-5">
                  <div className="relative">
                    <Avatar name={first.display_name} size="lg"
                      className={first.points > 0
                        ? 'bg-amber-100 dark:bg-amber-900/40 border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                        : 'bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500'} />
                    {first.points > 0 && <span className="absolute -bottom-1 -right-1 text-base leading-none">🥇</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">{first.display_name}</p>
                      {first.user_id === userId && <span className="text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded-full">אתה</span>}
                    </div>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{first.task_count} משימות הושלמו</p>
                    <div className="mt-2.5 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${first.points > 0 ? 'bg-amber-400' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                        style={{ width: `${maxPoints > 0 ? Math.round((first.points / maxPoints) * 100) : 0}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-3xl font-bold tabular-nums leading-none ${first.points > 0 ? 'text-amber-500' : 'text-zinc-300 dark:text-zinc-600'}`}>{first.points}</p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">נקודות</p>
                  </div>
                </div>
              </button>
              {openId === first.user_id && <div className="px-5 pb-4"><LogList logs={first.logs} /></div>}
            </div>
          )}

          {/* 2nd place */}
          {second && (() => {
            const isOpen = openId === second.user_id
            const pct = maxPoints > 0 ? Math.round((second.points / maxPoints) * 100) : 0
            return (
              <div className="relative overflow-hidden rounded-2xl border transition-all duration-200 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                <button type="button" className="w-full text-right" onClick={() => toggle(second.user_id)}>
                  <div className="flex items-center gap-4 p-5">
                    <div className="relative">
                      <Avatar name={second.display_name} size="lg" className="bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400" />
                      <span className="absolute -bottom-1 -right-1 text-base leading-none">🥈</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">{second.display_name}</p>
                        {second.user_id === userId && <span className="text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded-full">אתה</span>}
                      </div>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{second.task_count} משימות הושלמו</p>
                      <div className="mt-2.5 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700 bg-zinc-300 dark:bg-zinc-600" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-3xl font-bold tabular-nums leading-none text-zinc-400 dark:text-zinc-500">{second.points}</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">נקודות</p>
                    </div>
                  </div>
                </button>
                {isOpen && <div className="px-5 pb-4"><LogList logs={second.logs} /></div>}
              </div>
            )
          })()}

          {/* 3rd place */}
          {third && (() => {
            const isOpen = openId === third.user_id
            const pct = maxPoints > 0 ? Math.round((third.points / maxPoints) * 100) : 0
            return (
              <div className="relative overflow-hidden rounded-2xl border transition-all duration-200 bg-white dark:bg-zinc-900 border-orange-100 dark:border-orange-900/40">
                <button type="button" className="w-full text-right" onClick={() => toggle(third.user_id)}>
                  <div className="flex items-center gap-4 p-5">
                    <div className="relative">
                      <Avatar name={third.display_name} size="lg" className="bg-orange-50 dark:bg-orange-950/30 border-2 border-orange-200 dark:border-orange-800/60 text-orange-500 dark:text-orange-400" />
                      <span className="absolute -bottom-1 -right-1 text-base leading-none">🥉</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">{third.display_name}</p>
                        {third.user_id === userId && <span className="text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded-full">אתה</span>}
                      </div>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{third.task_count} משימות הושלמו</p>
                      <div className="mt-2.5 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700 bg-orange-300 dark:bg-orange-700/60" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-3xl font-bold tabular-nums leading-none text-orange-400 dark:text-orange-500">{third.points}</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">נקודות</p>
                    </div>
                  </div>
                </button>
                {isOpen && <div className="px-5 pb-4"><LogList logs={third.logs} /></div>}
              </div>
            )
          })()}

          {/* 4th+ */}
          {rest.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
              {rest.map((entry, idx) => {
                const isMe = entry.user_id === userId
                const isOpen = openId === entry.user_id
                const pct = maxPoints > 0 ? Math.round((entry.points / maxPoints) * 100) : 0
                return (
                  <div key={entry.user_id} className={isMe ? 'bg-violet-50/60 dark:bg-violet-950/20' : ''}>
                    <button type="button" className="w-full text-right" onClick={() => toggle(entry.user_id)}>
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <span className="text-xs font-bold text-zinc-300 dark:text-zinc-600 w-5 text-center flex-shrink-0">#{idx + 4}</span>
                        <Avatar name={entry.display_name} size="sm"
                          className={`border text-xs ${isMe ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-200 dark:border-violet-800/60 text-violet-600 dark:text-violet-400' : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <p className={`text-sm truncate font-medium ${isMe ? 'text-violet-700 dark:text-violet-400' : 'text-zinc-700 dark:text-zinc-300'}`}>{entry.display_name}</p>
                            {isMe && <span className="text-[9px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1 py-0.5 rounded-full flex-shrink-0">אתה</span>}
                          </div>
                          <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${isMe ? 'bg-violet-400' : 'bg-zinc-300 dark:bg-zinc-600'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-base font-bold tabular-nums ${isMe ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500 dark:text-zinc-400'}`}>{entry.points}</p>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{entry.task_count} משימות</p>
                        </div>
                      </div>
                    </button>
                    {isOpen && <div className="px-4 pb-3"><LogList logs={entry.logs} /></div>}
                  </div>
                )
              })}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
