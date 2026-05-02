// Server-side Hebrew calendar detection.
// Uses @hebcal/core for Yom Tov detection; Shabbat is pure JS.
// This file must only be imported in server components / API routes — never in client bundles.

import type { RoutineType } from './routines'

export type { RoutineType }

export interface ActiveRoutineEvent {
  type: RoutineType
  eventKey: string
  title: string       // Hebrew display name ("שבת", "ראש השנה", etc.)
  daysUntil: number   // How many Israel-civil-days until the event
}

// ── Holiday display names (keyed by @hebcal event description) ──────────────
// @hebcal includes the year in "Rosh Hashana YYYY" — we strip it with startsWith
const HOLIDAY_DISPLAY: Array<[prefix: string, slug: string, hebrew: string]> = [
  ['Rosh Hashana',      'rosh_hashana',      'ראש השנה'],
  ['Sukkot',            'sukkot',            'סוכות'],
  ['Shmini Atzeret',    'shmini_atzeret',    'שמחת תורה'],
  ['Simchat Torah',     'shmini_atzeret',    'שמחת תורה'],
  ['Pesach',            'pesach',            'פסח'],
  ['Shavuot',           'shavuot',           'שבועות'],
  // Yom Kippur intentionally omitted: no home-prep tasks in the usual sense
]

function lookupHoliday(desc: string): { slug: string; hebrew: string } | null {
  for (const [prefix, slug, hebrew] of HOLIDAY_DISPLAY) {
    if (desc === prefix || desc.startsWith(prefix + ' ') || desc.startsWith(prefix + ' I')) {
      return { slug, hebrew }
    }
  }
  return null
}

// Parse Israel civil date from any Date (UTC)
function toIsraelDate(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(d)
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0')
  return { year: get('year'), month: get('month'), day: get('day') }
}

// Build a local-midnight Date from an Israel civil {year, month, day} for diff calculations
function israelDateToLocal(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d)
}

export async function getActiveRoutineEvent(now: Date): Promise<ActiveRoutineEvent | null> {
  const { year, month, day } = toIsraelDate(now)
  const israelToday = israelDateToLocal(year, month, day)
  const dow = israelToday.getDay() // 0=Sun … 6=Sat

  // ── Shabbat: Thursday (4) or Friday (5) ────────────────────────────────────
  if (dow === 4 || dow === 5) {
    const daysUntil = dow === 4 ? 2 : 1
    const satDate = new Date(israelToday)
    satDate.setDate(satDate.getDate() + daysUntil)

    // ISO-week-based key so Thursday and Friday refer to the same Shabbat
    const y2 = satDate.getFullYear()
    const jan1 = new Date(y2, 0, 1)
    const weekNum = Math.ceil(((satDate.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
    const eventKey = `shabbat-${y2}-W${String(weekNum).padStart(2, '0')}`

    return { type: 'shabbat', eventKey, title: 'שבת', daysUntil }
  }

  // ── Yom Tov: look 1–3 Israel-civil-days ahead ─────────────────────────────
  try {
    const { HebrewCalendar, flags } = await import('@hebcal/core')

    // Calendar window: today through today+3 days
    const windowEnd = new Date(israelToday)
    windowEnd.setDate(windowEnd.getDate() + 3)

    // @hebcal uses local Date objects; pass midnight-UTC dates for the range
    const calStart = new Date(Date.UTC(year, month - 1, day))
    const calEnd = new Date(Date.UTC(
      windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate()
    ))

    const events = HebrewCalendar.calendar({ start: calStart, end: calEnd, il: true, noModern: true })

    for (const event of events) {
      if (!(event.getFlags() & flags.CHAG)) continue

      const info = lookupHoliday(event.getDesc())
      if (!info) continue

      // Convert event's Gregorian date to Israel civil date
      const gregUTC = event.getDate().greg()
      const iDate = toIsraelDate(gregUTC)
      const eventLocal = israelDateToLocal(iDate.year, iDate.month, iDate.day)
      const daysUntil = Math.round((eventLocal.getTime() - israelToday.getTime()) / 86400000)

      if (daysUntil < 1 || daysUntil > 3) continue

      const eventKey = `yom_tov-${info.slug}-${iDate.year}`
      return { type: 'yom_tov', eventKey, title: info.hebrew, daysUntil }
    }
  } catch {
    // @hebcal unavailable or calculation failed — Shabbat mode still works above
  }

  return null
}
