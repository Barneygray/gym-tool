// Must load before the Dexie instance in db.ts is constructed.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import type { Session } from '../types'
import { db, getAllSessions, getHistory, saveSession } from './db'

const HOUR = 3_600_000
const START = new Date(2026, 6, 22, 9, 0, 0).getTime()

const push = (over: Partial<Session> = {}): Session => ({
  uuid: 'sess-1',
  dayType: 'push',
  startedAt: START,
  finishedAt: START + HOUR,
  entries: [{ exerciseId: 'bench-press', sets: [{ weight: 80, reps: 5 }] }],
  ...over,
})

beforeEach(async () => {
  await db.sessions.clear()
})

describe('saving a session', () => {
  it('files a new session under a fresh row', async () => {
    await saveSession(push())
    expect(await getHistory()).toHaveLength(1)
  })

  it('mints a uuid when one is missing', async () => {
    const saved = await saveSession({ ...push(), uuid: '' })
    expect(saved.uuid).toMatch(/[0-9a-f-]{36}/)
  })

  it('stamps the row it returns, so the caller pushes what was stored', async () => {
    const saved = await saveSession(push())
    const stored = (await getAllSessions())[0]
    expect(saved.updatedAt).toBe(stored.updatedAt)
    expect(saved.id).toBe(stored.id)
  })

  // The whole point of continuing a session: finishing it a second time has to
  // land on the row it came from. Dexie's auto-increment key would otherwise
  // file the same workout again, and the log would show it twice.
  it('rewrites the existing row when the uuid comes back', async () => {
    await saveSession(push())
    const [first] = await getAllSessions()

    await saveSession(push({
      finishedAt: START + 2 * HOUR,
      entries: [
        { exerciseId: 'bench-press', sets: [{ weight: 80, reps: 5 }] },
        { exerciseId: 'overhead-press', sets: [{ weight: 45, reps: 8 }] },
      ],
    }))

    const history = await getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].id).toBe(first.id)
    expect(history[0].entries).toHaveLength(2)
    expect(history[0].finishedAt).toBe(START + 2 * HOUR)
    // The original start survives, so the session's duration still covers the
    // whole workout rather than restarting at the mis-tap.
    expect(history[0].startedAt).toBe(START)
  })

  it('keeps distinct sessions apart', async () => {
    await saveSession(push())
    await saveSession(push({ uuid: 'sess-2', startedAt: START + 24 * HOUR }))
    expect(await getHistory()).toHaveLength(2)
  })
})
