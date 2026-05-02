export type FrequencyUnit = 'hours' | 'days' | 'weeks' | 'months'

export interface Task {
  id: string
  household_id: string
  title: string
  description?: string
  frequency_value: number
  frequency_unit: FrequencyUnit
  last_done_at: string | null
  next_due_at: string | null
  assigned_to: string | null
  category: TaskCategory
  icon: string
  is_quick: boolean
  points?: number
  schedule_type?: 'recurring' | 'weekly' | 'one_time'
  schedule_days?: number[] | null
  schedule_time?: string | null
  notify_before_hours?: number
  created_by: string
  created_at: string
}

export type TaskCategory =
  | 'cleaning'
  | 'laundry'
  | 'plants'
  | 'kitchen'
  | 'shopping'
  | 'maintenance'
  | 'other'

export interface TaskLog {
  id: string
  task_id: string
  done_by: string
  done_at: string
  note?: string
}

export interface HouseholdMember {
  id: string
  household_id: string
  user_id: string
  display_name: string
  role: 'admin' | 'member'
}

export interface Household {
  id: string
  name: string
  invite_code: string
  created_at: string
}

export type TaskStatus = 'overdue' | 'due_today' | 'due_soon' | 'ok'

export function getTaskStatus(task: Task): TaskStatus {
  if (!task.next_due_at) return 'ok'
  const now = new Date()
  const due = new Date(task.next_due_at)
  const diffMs = due.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffMs < 0) return 'overdue'
  if (diffHours < 24) return 'due_today'
  if (diffHours < 48) return 'due_soon'
  return 'ok'
}

export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case 'overdue': return 'text-red-500'
    case 'due_today': return 'text-orange-500'
    case 'due_soon': return 'text-yellow-500'
    case 'ok': return 'text-green-500'
  }
}

export function formatFrequency(value: number, unit: FrequencyUnit): string {
  const unitMap: Record<FrequencyUnit, string> = {
    hours: value === 1 ? 'שעה' : 'שעות',
    days: value === 1 ? 'יום' : 'ימים',
    weeks: value === 1 ? 'שבוע' : 'שבועות',
    months: value === 1 ? 'חודש' : 'חודשים',
  }
  return `כל ${value} ${unitMap[unit]}`
}

const DAY_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

export function formatSchedule(task: Task): string {
  if (task.schedule_type === 'one_time') return 'חד פעמי'
  if (task.schedule_type === 'weekly' && task.schedule_days?.length) {
    const days = task.schedule_days.map(d => DAY_SHORT[d]).join(' ')
    const time = task.schedule_time ? ` | ${task.schedule_time}` : ''
    return `${days}${time}`
  }
  return formatFrequency(task.frequency_value, task.frequency_unit)
}
