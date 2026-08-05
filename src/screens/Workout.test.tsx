import { useState } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BodyLog, Session, Settings } from '../types'
import { DEFAULT_SETTINGS, db, getHistory } from '../db/db'
import type { ActiveWorkout } from '../App'
import { WorkoutScreen } from './Workout'

// Sync is a background job with no bearing on any of this, and letting it load
// the real client would put a network fetch in the middle of every test.
vi.mock('../db/supabaseClient', () => ({
  supabaseConfigured: false,
  OWNER_HEADER: 'x-forge-owner',
  clientOptions: () => ({}),
  getSupabase: () => Promise.resolve(null),
}))

/**
 * The session loop — log a set, fix it, delete it, finish — is the part of the
 * app that is holding data you cannot re-derive: get it wrong and the work is
 * simply gone. It was also, until now, the largest screen in the app with no
 * test of any kind on it.
 */

const HOUR = 3_600_000
const START = new Date(2026, 6, 22, 9, 0, 0).getTime()

const settings: Settings = { ...DEFAULT_SETTINGS }

function makeActive(over: Partial<ActiveWorkout> = {}): ActiveWorkout {
  return {
    dayType: 'push',
    startedAt: START,
    exerciseIds: ['bench-press', 'overhead-press'],
    logged: {},
    currentIndex: 0,
    sessionUuid: 'live-1',
    ...over,
  }
}

/** Renders the screen the way App does: holding `active` and writing it back. */
function Harness({ initial, bodyLog = [], history = [], onFinished = async () => {} }: {
  initial: ActiveWorkout
  bodyLog?: BodyLog[]
  history?: Session[]
  onFinished?: () => Promise<void>
}) {
  const [active, setActive] = useState<ActiveWorkout | null>(initial)
  if (!active) return <div>left the session</div>
  return (
    <WorkoutScreen
      active={active}
      setActive={setActive}
      history={history}
      settings={settings}
      bodyLog={bodyLog}
      onFinished={onFinished}
      onStretch={() => {}}
    />
  )
}

/** What a stepper currently reads, taken from the label a screen reader gets. */
const stepperValue = (label: string): string =>
  (screen.getByRole('status', { name: new RegExp(`^${label}:`) }).getAttribute('aria-label') ?? '')
    .replace(`${label}: `, '')
    .replace(' kg', '')

const logSet = async (user: ReturnType<typeof userEvent.setup>, rpe: number) => {
  await user.click(screen.getByRole('button', { name: new RegExp(`^RPE ${rpe} —`) }))
  await user.click(screen.getByRole('button', { name: /^Log set/ }))
}

beforeEach(async () => {
  await db.sessions.clear()
})

describe('logging a set', () => {
  it('will not accept one until an RPE is picked', async () => {
    const user = userEvent.setup()
    render(<Harness initial={makeActive()} />)

    const log = screen.getByRole('button', { name: /^Log set 1/ })
    expect(log).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /^RPE 8 —/ }))
    expect(screen.getByRole('button', { name: /^Log set 1/ })).toBeEnabled()
  })

  it('records the weight, reps and RPE that were on screen', async () => {
    const user = userEvent.setup()
    render(<Harness initial={makeActive()} />)

    await user.click(screen.getByRole('button', { name: 'Weight up 2.5 kg' }))
    await user.click(screen.getByRole('button', { name: 'Reps up 1' }))
    const weight = stepperValue('Weight')
    const reps = stepperValue('Reps')

    await logSet(user, 8)

    const row = screen.getByRole('button', { name: /^S1/ })
    expect(row).toHaveTextContent(`${weight} kg × ${reps}`)
    expect(row).toHaveTextContent('RPE 8')
  })

  it('counts up, so the next set is offered as the next one', async () => {
    const user = userEvent.setup()
    render(<Harness initial={makeActive()} />)
    await logSet(user, 8)
    expect(screen.getByRole('button', { name: /^Log set 2/ })).toBeInTheDocument()
  })
})

describe('fixing a mistyped set', () => {
  it('rewrites the set being edited rather than appending another', async () => {
    const user = userEvent.setup()
    render(<Harness initial={makeActive()} />)
    await logSet(user, 8)
    await logSet(user, 9)
    expect(screen.getAllByRole('button', { name: /^S\d/ })).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /^S1/ }))
    await user.click(screen.getByRole('button', { name: 'Reps up 1' }))
    await user.click(screen.getByRole('button', { name: /^Update set 1/ }))

    const rows = screen.getAllByRole('button', { name: /^S\d/ })
    expect(rows).toHaveLength(2)
    // The edited set keeps its place in the session, not appended to the end.
    expect(rows[0].textContent).toContain('RPE 8')
    expect(rows[1].textContent).toContain('RPE 9')
  })

  it('drops a set on delete', async () => {
    const user = userEvent.setup()
    render(<Harness initial={makeActive()} />)
    await logSet(user, 8)
    await logSet(user, 9)

    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    const rows = screen.getAllByRole('button', { name: /^S\d/ })
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('RPE 9')
  })
})

// "Anything you've already logged sets against is protected from a swap or
// skip so the work can't be stranded" — the guarantee lives in whether the
// buttons are on screen at all, which is exactly what a unit test can't see.
describe('changing the station mid-session', () => {
  // Scoped to the station's own controls: the rest timer has a "Skip" too.
  const stationControls = () => within(screen.getByRole('group', { name: 'Station controls' }))

  it('offers swap and skip on an untouched station', () => {
    render(<Harness initial={makeActive()} />)
    expect(stationControls().getByRole('button', { name: /Swap/ })).toBeInTheDocument()
    expect(stationControls().getByRole('button', { name: /Skip/ })).toBeInTheDocument()
  })

  it('withdraws both once a set is logged against it', async () => {
    const user = userEvent.setup()
    render(<Harness initial={makeActive()} />)
    await logSet(user, 8)

    expect(stationControls().queryByRole('button', { name: /Swap/ })).not.toBeInTheDocument()
    expect(stationControls().queryByRole('button', { name: /Skip/ })).not.toBeInTheDocument()
    // Adding a station is always allowed — it strands nothing.
    expect(stationControls().getByRole('button', { name: /Add exercise/ })).toBeInTheDocument()
  })
})

describe('finishing', () => {
  it('writes one session holding the sets that were logged', async () => {
    const user = userEvent.setup()
    render(<Harness initial={makeActive()} />)
    await logSet(user, 8)
    await logSet(user, 8)
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    expect(await screen.findByText('Session done')).toBeInTheDocument()
    const history = await getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].uuid).toBe('live-1')
    expect(history[0].entries).toHaveLength(1)
    expect(history[0].entries[0].sets).toHaveLength(2)
    expect(history[0].startedAt).toBe(START)
    expect(history[0].finishedAt).toBeDefined()
  })

  it('drops stations that were never logged against', async () => {
    const user = userEvent.setup()
    render(<Harness initial={makeActive()} />)
    await logSet(user, 8)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await screen.findByText('Session done')

    const [session] = await getHistory()
    expect(session.entries.map((e) => e.exerciseId)).toEqual(['bench-press'])
  })

  // The whole point of Continue: finishing a second time has to land on the row
  // it came from, or one interrupted workout reads as two short ones.
  it('rewrites the same row when a continued session is finished again', async () => {
    const user = userEvent.setup()
    const existing: Session = {
      uuid: 'live-1',
      dayType: 'push',
      startedAt: START,
      finishedAt: START + HOUR,
      entries: [{ exerciseId: 'bench-press', sets: [{ weight: 60, reps: 5, rpe: 8 }] }],
    }
    await db.sessions.add({ ...existing })

    render(
      <Harness
        initial={makeActive({
          logged: { 'bench-press': [{ weight: 60, reps: 5, rpe: 8 }] },
        })}
        history={[existing]}
      />,
    )
    await logSet(user, 9)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await screen.findByText('Session done')

    const history = await getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].entries[0].sets).toHaveLength(2)
    expect(history[0].startedAt).toBe(START)
  })

  it('shows what was done on the summary', async () => {
    const user = userEvent.setup()
    render(<Harness initial={makeActive()} />)
    await user.click(screen.getByRole('button', { name: 'Weight up 10 kg' }))
    await logSet(user, 8)
    await logSet(user, 8)
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    const sets = await screen.findByText('Sets')
    expect(within(sets.parentElement as HTMLElement).getByText('2')).toBeInTheDocument()
  })
})

describe('the rest timer', () => {
  it('starts on a logged set and keeps running across a station change', async () => {
    const user = userEvent.setup()
    render(<Harness initial={makeActive()} />)
    await logSet(user, 8)

    const timer = screen.getByRole('timer')
    expect(timer).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    // Still counting, and now saying which station it belongs to.
    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(screen.getByText(/Barbell Bench Press/)).toBeInTheDocument()
  })
})

// A session logged with no sets at all is not a session; filing it would put a
// zero-tonnage workout into freshness, consistency and stall detection.
describe('finishing an empty session', () => {
  it('files nothing', async () => {
    const user = userEvent.setup()
    render(<Harness initial={makeActive()} />)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await act(async () => {})

    expect(await getHistory()).toHaveLength(0)
    expect(screen.getByText('left the session')).toBeInTheDocument()
  })
})
