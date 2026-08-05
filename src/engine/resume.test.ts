import { describe, it, expect } from 'vitest'
import type { Session, SessionEntry } from '../types'
import { MOBILITY } from '../types'
import type { ActiveWorkout } from '../App'
import {
  draftSession, finishedAgoLabel, resumableSession, resumeWorkout, startedAgoLabel, withoutSession,
} from './resume'

const MIN = 60_000
const HOUR = 60 * MIN
/** Mid-afternoon, so "earlier today" and "yesterday" stay on separate dates. */
const NOW = new Date(2026, 6, 22, 15, 0, 0).getTime()

function session(over: Partial<Session> & { startedAt: number }): Session {
  const entries: SessionEntry[] = over.entries ?? [
    { exerciseId: 'bench-press', sets: [{ weight: 80, reps: 5 }, { weight: 80, reps: 5 }] },
  ]
  return {
    uuid: over.uuid ?? crypto.randomUUID(),
    dayType: over.dayType ?? 'push',
    finishedAt: over.finishedAt ?? over.startedAt + HOUR,
    ...over,
    entries,
  }
}

describe('resuming today’s session', () => {
  it('offers the session finished earlier today', () => {
    const today = session({ startedAt: NOW - 2 * HOUR })
    expect(resumableSession([today], NOW)?.uuid).toBe(today.uuid)
  })

  it('stops offering it once the day is over', () => {
    const yesterday = session({ startedAt: NOW - 26 * HOUR })
    expect(resumableSession([yesterday], NOW)).toBeNull()
  })

  it('picks the latest gym session, not the latest of any kind', () => {
    const push = session({ startedAt: NOW - 3 * HOUR, dayType: 'push' })
    const stretch = session({ startedAt: NOW - 20 * MIN, dayType: MOBILITY })
    const conditioning = session({ startedAt: NOW - 10 * MIN, dayType: 'conditioning' })
    expect(resumableSession([conditioning, stretch, push], NOW)?.uuid).toBe(push.uuid)
  })

  it('never offers a stretch or conditioning log on its own', () => {
    const stretch = session({ startedAt: NOW - 20 * MIN, dayType: MOBILITY })
    expect(resumableSession([stretch], NOW)).toBeNull()
  })

  it('takes the most recently finished, not the earliest started', () => {
    const long = session({ startedAt: NOW - 5 * HOUR, finishedAt: NOW - 30 * MIN })
    const short = session({ startedAt: NOW - 4 * HOUR, finishedAt: NOW - 3 * HOUR })
    expect(resumableSession([short, long], NOW)?.uuid).toBe(long.uuid)
  })

  it('keeps a session that ran past midnight resumable in the small hours', () => {
    const justAfterMidnight = new Date(2026, 6, 23, 0, 30, 0).getTime()
    const overnight = session({
      startedAt: new Date(2026, 6, 22, 23, 30, 0).getTime(),
      finishedAt: new Date(2026, 6, 23, 0, 15, 0).getTime(),
    })
    expect(resumableSession([overnight], justAfterMidnight)?.uuid).toBe(overnight.uuid)
  })
})

describe('reopening a finished session', () => {
  const finished = session({
    uuid: 'sess-1',
    startedAt: NOW - 90 * MIN,
    dayType: 'pull',
    readiness: 'beat',
    entries: [
      { exerciseId: 'barbell-row', sets: [{ weight: 70, reps: 8 }] },
      { exerciseId: 'lat-pulldown', sets: [{ weight: 55, reps: 10 }, { weight: 55, reps: 9 }] },
    ],
  })

  it('restores the stations and every logged set', () => {
    const active = resumeWorkout(finished)
    expect(active.exerciseIds).toEqual(['barbell-row', 'lat-pulldown'])
    expect(active.logged['lat-pulldown']).toEqual([
      { weight: 55, reps: 10 }, { weight: 55, reps: 9 },
    ])
    expect(active.dayType).toBe('pull')
    expect(active.readiness).toBe('beat')
  })

  it('keeps the original start time so the workout stays one workout', () => {
    expect(resumeWorkout(finished).startedAt).toBe(finished.startedAt)
  })

  it('carries the session identity, so finishing again rewrites the same record', () => {
    expect(resumeWorkout(finished).sessionUuid).toBe('sess-1')
  })

  it('drops you back at the last station you logged against', () => {
    expect(resumeWorkout(finished).currentIndex).toBe(1)
  })

  it('copies the sets rather than aliasing the saved session', () => {
    const active = resumeWorkout(finished)
    active.logged['barbell-row'][0].reps = 99
    expect(finished.entries[0].sets[0].reps).toBe(8)
  })

  it('hides the session from the engine while it is being continued', () => {
    const other = session({ uuid: 'sess-2', startedAt: NOW - 4 * 24 * HOUR })
    expect(withoutSession([finished, other], 'sess-1').map((s) => s.uuid)).toEqual(['sess-2'])
    expect(withoutSession([finished, other], undefined)).toHaveLength(2)
  })
})

describe('how long ago it was logged', () => {
  it('reads in minutes, then hours', () => {
    expect(finishedAgoLabel(session({ startedAt: NOW - HOUR, finishedAt: NOW - 20 * 1000 }), NOW))
      .toBe('just now')
    expect(finishedAgoLabel(session({ startedAt: NOW - HOUR, finishedAt: NOW - 7 * MIN }), NOW))
      .toBe('7 min ago')
    expect(finishedAgoLabel(session({ startedAt: NOW - 3 * HOUR, finishedAt: NOW - 61 * MIN }), NOW))
      .toBe('1 hr ago')
    expect(finishedAgoLabel(session({ startedAt: NOW - 5 * HOUR, finishedAt: NOW - 4 * HOUR }), NOW))
      .toBe('4 hrs ago')
  })
})

describe('the row a live session is saved as', () => {
  const active: ActiveWorkout = {
    dayType: 'push',
    startedAt: NOW - HOUR,
    exerciseIds: ['bench-press', 'overhead-press', 'triceps-pushdown'],
    logged: {
      'bench-press': [{ weight: 80, reps: 5, rpe: 8 }],
      'overhead-press': [],
    },
    currentIndex: 1,
    readiness: 'beat',
    sessionUuid: 'live-1',
  }

  it('carries the identity and start of the session being logged', () => {
    const s = draftSession(active, 'home-rack')
    expect(s.uuid).toBe('live-1')
    expect(s.startedAt).toBe(NOW - HOUR)
    expect(s.readiness).toBe('beat')
    expect(s.profileId).toBe('home-rack')
  })

  // Unfinished is what keeps it out of `getHistory`, and so out of every
  // suggestion, PR and freshness reading until it's actually done.
  it('is unfinished', () => {
    expect(draftSession(active).finishedAt).toBeUndefined()
  })

  it('holds only stations with sets against them', () => {
    expect(draftSession(active).entries.map((e) => e.exerciseId)).toEqual(['bench-press'])
  })

  it('round-trips back into the workout it came from', () => {
    const reopened = resumeWorkout(draftSession(active))
    expect(reopened.sessionUuid).toBe('live-1')
    expect(reopened.startedAt).toBe(active.startedAt)
    expect(reopened.logged['bench-press']).toEqual(active.logged['bench-press'])
    expect(reopened.readiness).toBe('beat')
  })
})

describe('how long a session has been running', () => {
  it('reads from when it started, not when it was written', () => {
    expect(startedAgoLabel(session({ startedAt: NOW - 40 * MIN }), NOW)).toBe('40 min ago')
    expect(startedAgoLabel(session({ startedAt: NOW - 2 * HOUR }), NOW)).toBe('2 hrs ago')
  })
})
