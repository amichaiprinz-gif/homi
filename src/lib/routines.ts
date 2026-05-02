// Routine types and default task templates.
// Customizations are stored per-device in localStorage under 'hb_routine_tpl_<type>'.
// This file is safe to import on both server and client.

export type RoutineType = 'shabbat' | 'yom_tov' | 'hosting'

export interface RoutineTask {
  id: string
  title: string
  icon: string
  category: string
  points: number
  enabled: boolean
}

export const DEFAULT_TASKS: Record<RoutineType, RoutineTask[]> = {
  shabbat: [
    { id: 's1', title: 'לשים מיחם',              icon: '♨️',  category: 'kitchen',   points: 1, enabled: true },
    { id: 's2', title: 'להחליף מפה',             icon: '🪄',  category: 'cleaning',  points: 1, enabled: true },
    { id: 's3', title: 'להכין נרות שבת',         icon: '🕯️', category: 'other',     points: 1, enabled: true },
    { id: 's4', title: 'לסדר שולחן שבת',         icon: '🍽️', category: 'kitchen',   points: 2, enabled: true },
    { id: 's5', title: 'לקנות / להכין חלות',     icon: '🍞',  category: 'shopping',  points: 1, enabled: true },
    { id: 's6', title: 'לרוקן פח אשפה',          icon: '🗑️', category: 'cleaning',  points: 1, enabled: true },
    { id: 's7', title: 'לבדוק מצרכים חסרים',     icon: '📋',  category: 'shopping',  points: 1, enabled: true },
  ],
  yom_tov: [
    { id: 'y1', title: 'להכין נרות חג',          icon: '🕯️', category: 'other',     points: 1, enabled: true },
    { id: 'y2', title: 'לסדר שולחן חג',          icon: '🍽️', category: 'kitchen',   points: 2, enabled: true },
    { id: 'y3', title: 'להכין מיחם / פלטה',      icon: '♨️',  category: 'kitchen',   points: 1, enabled: true },
    { id: 'y4', title: 'לקנות מצרכים לחג',       icon: '🛒',  category: 'shopping',  points: 2, enabled: true },
    { id: 'y5', title: 'לסדר הבית לכבוד החג',    icon: '🧹',  category: 'cleaning',  points: 3, enabled: true },
    { id: 'y6', title: 'לרוקן פח אשפה',          icon: '🗑️', category: 'cleaning',  points: 1, enabled: true },
  ],
  hosting: [
    { id: 'h1', title: 'להוסיף כיסאות לשולחן',  icon: '🪑',  category: 'other',     points: 1, enabled: true },
    { id: 'h2', title: 'להכין מצעים לאורחים',    icon: '🛏️', category: 'cleaning',  points: 2, enabled: true },
    { id: 'h3', title: 'לקנות שתייה ונשנושים',   icon: '🥤',  category: 'shopping',  points: 1, enabled: true },
    { id: 'h4', title: 'לנקות שירותי אורחים',    icon: '🚿',  category: 'cleaning',  points: 2, enabled: true },
    { id: 'h5', title: 'להכין מנות נוספות',      icon: '🍲',  category: 'kitchen',   points: 2, enabled: true },
    { id: 'h6', title: 'לסדר סלון לאורחים',      icon: '🛋️', category: 'cleaning',  points: 1, enabled: true },
  ],
}

export const ROUTINE_INFO: Record<RoutineType, { label: string; icon: string; description: string }> = {
  shabbat:  { label: 'שבת',      icon: '🕯️', description: 'מוצג ביום חמישי ושישי לפני שבת' },
  yom_tov:  { label: 'יום טוב', icon: '✡️', description: 'מוצג לפני יום טוב (ר"ה, סוכות, פסח, שבועות)' },
  hosting:  { label: 'אירוח',   icon: '🍽️', description: 'מוצג ביום חמישי–שישי כשמארחים שבת' },
}

// ── localStorage helpers (client-side only) ──────────────────────────────────

export function getRoutineTasks(type: RoutineType): RoutineTask[] {
  if (typeof window === 'undefined') return DEFAULT_TASKS[type]
  try {
    const raw = localStorage.getItem(`hb_routine_tpl_${type}`)
    if (raw) {
      const parsed = JSON.parse(raw) as RoutineTask[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch { /* ignore */ }
  return DEFAULT_TASKS[type]
}

export function saveRoutineTasks(type: RoutineType, tasks: RoutineTask[]) {
  try { localStorage.setItem(`hb_routine_tpl_${type}`, JSON.stringify(tasks)) } catch { /* ignore */ }
}

export function isRoutineActive(type: RoutineType): boolean {
  if (typeof window === 'undefined') return true
  try { return localStorage.getItem(`hb_routine_active_${type}`) !== 'false' } catch { return true }
}

export function setRoutineActive(type: RoutineType, active: boolean) {
  try { localStorage.setItem(`hb_routine_active_${type}`, active ? 'true' : 'false') } catch { /* ignore */ }
}

export function isRoutineDone(eventKey: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !!(localStorage.getItem(`hb_routine_done_${eventKey}`) || localStorage.getItem(`hb_routine_dismissed_${eventKey}`))
  } catch { return false }
}

export function markRoutineDone(eventKey: string) {
  try { localStorage.setItem(`hb_routine_done_${eventKey}`, '1') } catch { /* ignore */ }
}

export function markRoutineDismissed(eventKey: string) {
  try { localStorage.setItem(`hb_routine_dismissed_${eventKey}`, '1') } catch { /* ignore */ }
}
