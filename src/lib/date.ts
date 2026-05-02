import type { FrequencyUnit } from '@/types'

const UNIT_MS: Record<FrequencyUnit, number> = {
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
  months: 2_592_000_000,
}

export function computeNextDue(value: number, unit: FrequencyUnit, from: Date): string {
  return new Date(from.getTime() + value * UNIT_MS[unit]).toISOString()
}

/**
 * Computes the next due date for a weekly-scheduled task.
 * @param days - array of JS day-of-week numbers (0=Sun … 6=Sat)
 * @param time - 'HH:MM' string
 * @param from - reference date (usually "now" or "just-done")
 */
export function computeNextDueWeekly(days: number[], time: string, from: Date): string {
  const [hours, minutes] = (time || '08:00').split(':').map(Number)

  for (let offset = 1; offset <= 7; offset++) {
    const candidate = new Date(from)
    candidate.setDate(from.getDate() + offset)
    candidate.setHours(hours, minutes, 0, 0)
    if (days.includes(candidate.getDay())) {
      return candidate.toISOString()
    }
  }

  // Fallback: 7 days from now at specified time
  const fallback = new Date(from)
  fallback.setDate(from.getDate() + 7)
  fallback.setHours(hours, minutes, 0, 0)
  return fallback.toISOString()
}
