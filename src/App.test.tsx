import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from './types'
import { db, getDraftSession, getHistory, saveSettings } from './db/db'
import App from './App'

vi.mock('./db/supabaseClient', () => ({
  supabaseConfigured: false,
  OWNER_HEADER: 'x-forge-owner',
  clientOptions: () => ({}),
  getSupabase: () => Promise.resolve(null),
}))

/**
 * A session in progress used to live in exactly one place — a JSON blob in
 * localStorage — and reach durable storage only when Finish was tapped. A flat
 * battery, a cleared site, or a browser that refuses to write took the whole
 * workout with it, and the cloud backup had never seen a set of it.
 *
 * These cover the row underneath it: that it's written as the session goes,
 * that it survives the tab, that it can be walked back into, and that it is
 * cleaned up when it should be and left alone when it shouldn't.
 */

const START = new Date(2026, 6, 22, 9, 0, 0).getTime()

const draft = (over: Partial<Session> = {}): Session => ({
  uuid: 'draft-1',
  dayType: 'push',
  startedAt: Date.now() - 20 * 60_000,
  entries: [{ exerciseId: 'bench-press', sets: [{ weight: 60, reps: 5, rpe: 8 }] }],
  updatedAt: Date.now() - 60_000,
  ...over,
})

beforeEach(async () => {
  await db.sessions.clear()
  await db.settings.clear()
  // Skip onboarding — it isn't what any of this is about.
  await saveSettings({ id: 'main', barWeightKg: 20, platesKg: [25, 20, 10, 5, 2.5], soundOn: false, onboardedAt: START })
})

describe('a session left in progress', () => {
  it('is offered back on Train, with what was logged into it', async () => {
    await db.sessions.add(draft())
    render(<App />)

    expect(await screen.findByText(/In progress/)).toBeInTheDocument()
    expect(screen.getByText(/1 exercise · 1 set logged/)).toBeInTheDocument()
  })

  it('reopens the same session rather than starting a second one', async () => {
    const user = userEvent.setup()
    await db.sessions.add(draft())
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    // Back in the session, standing at the station that was being logged.
    expect(await screen.findByRole('heading', { name: 'Barbell Bench Press' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Log set 2/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^RPE 9 —/ }))
    await user.click(screen.getByRole('button', { name: /^Log set 2/ }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await screen.findByText('Session done')

    const history = await getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].uuid).toBe('draft-1')
    expect(history[0].entries[0].sets).toHaveLength(2)
  })

  it('is not offered once it is a day old', async () => {
    await db.sessions.add(draft({ startedAt: Date.now() - 30 * 3_600_000 }))
    render(<App />)

    await waitFor(() => expect(screen.getByText(/Train next|Today’s plan/)).toBeInTheDocument())
    expect(screen.queryByText(/In progress/)).not.toBeInTheDocument()
  })

  it('stays out of the history the engine reads', async () => {
    await db.sessions.add(draft())
    expect(await getHistory()).toHaveLength(0)
    expect(await getDraftSession()).toBeDefined()
  })
})

describe('the row a live session writes', () => {
  it('is saved as sets are logged, not held back until Finish', async () => {
    const user = userEvent.setup()
    await db.sessions.add(draft())
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /^RPE 9 —/ }))
    await user.click(screen.getByRole('button', { name: /^Log set 2/ }))

    await waitFor(async () => {
      const stored = await getDraftSession()
      expect(stored?.entries[0].sets).toHaveLength(2)
    })
    // Still unfinished — a session being logged is not a session that happened.
    expect(await getHistory()).toHaveLength(0)
  })

  it('survives a browser that refuses to write to localStorage', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    await db.sessions.add(draft())
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /^RPE 9 —/ }))
    await user.click(screen.getByRole('button', { name: /^Log set 2/ }))

    // The set logged rather than throwing out of the handler, and the copy that
    // matters is the row — which is the point of there being one.
    expect(screen.getByRole('button', { name: /^Log set 3/ })).toBeInTheDocument()
    await waitFor(async () => {
      expect((await getDraftSession())?.entries[0].sets).toHaveLength(2)
    })
  })

  // Otherwise the row keeps sets that were deleted, and offers them back.
  it('is dropped when the last set in it is deleted', async () => {
    const user = userEvent.setup()
    await db.sessions.add(draft())
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /^RPE 9 —/ }))
    await user.click(screen.getByRole('button', { name: /^Log set 2/ }))
    await waitFor(async () => {
      expect((await getDraftSession())?.entries[0].sets).toHaveLength(2)
    })

    await user.click(screen.getByRole('button', { name: 'Delete set 2' }))
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    await waitFor(async () => expect(await getDraftSession()).toBeUndefined())
  })

  // Continuing from the summary reopens a row that is already in the log. The
  // live screen writing over it must not clear the fact that it happened.
  it('does not un-finish a session carried on from the summary', async () => {
    const user = userEvent.setup()
    await db.sessions.add(draft())
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /^RPE 9 —/ }))
    await user.click(screen.getByRole('button', { name: /^Log set 2/ }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await screen.findByText('Session done')

    await user.click(screen.getByRole('button', { name: /Not finished\?/ }))
    await user.click(await screen.findByRole('button', { name: /^RPE 8 —/ }))
    await user.click(screen.getByRole('button', { name: /^Log set 3/ }))

    // Still one finished session in the log the whole way through — not a
    // workout that briefly stopped having happened.
    await waitFor(async () => {
      const [session] = await getHistory()
      expect(session?.entries[0].sets).toHaveLength(3)
    })
    const [session] = await getHistory()
    expect(session.finishedAt).toBeDefined()
    expect(await getDraftSession()).toBeUndefined()
  })

  it('is left alone when the session is finished properly', async () => {
    const user = userEvent.setup()
    await db.sessions.add(draft())
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /^RPE 9 —/ }))
    await user.click(screen.getByRole('button', { name: /^Log set 2/ }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await screen.findByText('Session done')

    await waitFor(async () => expect(await getHistory()).toHaveLength(1))
    expect(await getDraftSession()).toBeUndefined()
    const [session] = await getHistory()
    expect(session.deletedAt).toBeUndefined()
  })
})
