import type { ReminderConfig, Session } from '../types'
import { recommendDay } from './coach'

export interface ReminderNudge {
  due: boolean
  title: string
  body: string
}

/** Start-of-day epoch for a timestamp (local time). */
function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Did a gym session (not conditioning) already happen today? */
export function trainedToday(history: Session[], now: number): boolean {
  const today = startOfDay(now)
  return history.some(
    (s) => s.dayType !== 'conditioning' && startOfDay(s.startedAt) === today,
  )
}

/**
 * Whether a "time to train" nudge is due right now, plus its copy. Due when the
 * reminder is enabled, the local hour has arrived, and no gym session is logged
 * today. The body reuses the coach's pick so the nudge names a concrete day.
 */
export function reminderNudge(
  config: ReminderConfig | null | undefined,
  history: Session[],
  now: number,
): ReminderNudge {
  if (!config) return { due: false, title: '', body: '' }
  const hourNow = new Date(now).getHours()
  const due = hourNow >= config.hour && !trainedToday(history, now)
  const rec = recommendDay(history, now)
  const overdue = rec.overdue.length > 0
  return {
    due,
    title: overdue ? 'Muscles are going stale 💤' : 'Time to train 💪',
    body: `${rec.dayName} is your call today — ${rec.reason}`,
  }
}
