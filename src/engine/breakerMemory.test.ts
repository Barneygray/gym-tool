import { describe, it, expect } from 'vitest'
import { BREAKER_LEVELS, FIELD_W, LIVES, PADDLE_Y, WALL, newGame, step } from './breaker'
import {
  freshMemory, hasProgress, loadMemory, nextRun, restoreMemory, saveMemory,
  type MemoryStore,
} from './breakerMemory'

/** localStorage, minus the browser. */
function fakeStore(): MemoryStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

const SESSION = '1700000000000'

describe('brick breaker session memory', () => {
  it('starts a session on a fresh game', () => {
    const m = loadMemory(SESSION, fakeStore())
    expect(m.state.levelIndex).toBe(0)
    expect(m.state.score).toBe(0)
    expect(m.state.lives).toBe(LIVES)
    expect(m.carried).toBe(false)
    expect(hasProgress(m)).toBe(false)
  })

  it('picks the run back up on the next rest — level, score, lives and damage', () => {
    const store = fakeStore()
    const s = newGame(2)
    s.score = 380
    s.lives = 2
    s.bricks = s.bricks.slice(0, 4)
    s.bricks[0].hp = 1 // a two-hit brick already hit once
    s.bricks[0].maxHp = 2
    saveMemory(SESSION, { state: s, best: 0, runs: 0 }, store)

    const back = loadMemory(SESSION, store)
    expect(back.state.levelIndex).toBe(2)
    expect(back.state.score).toBe(380)
    expect(back.state.lives).toBe(2)
    expect(back.state.bricks).toHaveLength(4)
    expect(back.state.bricks[0].hp).toBe(1)
    expect(back.carried).toBe(true)
  })

  it('hands the run back parked, never mid-rally', () => {
    const store = fakeStore()
    const s = newGame()
    s.status = 'playing'
    s.ball = { x: 40, y: 120, vx: 90, vy: -140 }
    s.score = 60
    saveMemory(SESSION, { state: s, best: 0, runs: 0 }, store)

    const back = loadMemory(SESSION, store).state
    expect(back.status).toBe('ready')
    expect(back.ball.vx).toBe(0)
    expect(back.ball.vy).toBe(0)
    expect(back.ball.y).toBeLessThan(PADDLE_Y)
    // And it stays where it was put until it's served again.
    step(back, 1)
    expect(back.ball.y).toBeLessThan(PADDLE_Y)
  })

  it('remembers the best run of the session once a run ends', () => {
    const store = fakeStore()
    const over = newGame()
    over.score = 540
    over.status = 'over'
    over.lives = 0

    const started = nextRun({ state: over, best: 120, runs: 1, carried: true })
    expect(started.best).toBe(540)
    expect(started.runs).toBe(2)
    expect(started.state.score).toBe(0)
    expect(started.state.levelIndex).toBe(0)

    saveMemory(SESSION, started, store)
    const back = loadMemory(SESSION, store)
    expect(back.best).toBe(540)
    expect(back.runs).toBe(2)
    // The best score carries, but a racked-up game isn't one you left half-played.
    expect(back.carried).toBe(false)
  })

  it('counts a run in progress towards the session best', () => {
    const store = fakeStore()
    const s = newGame()
    s.score = 250
    saveMemory(SESSION, { state: s, best: 100, runs: 1 }, store)
    expect(loadMemory(SESSION, store).best).toBe(250)
  })

  it('starts over for a different workout', () => {
    const store = fakeStore()
    const s = newGame(3)
    s.score = 900
    saveMemory(SESSION, { state: s, best: 900, runs: 2 }, store)

    const other = loadMemory('1700009999999', store)
    expect(other.state.levelIndex).toBe(0)
    expect(other.state.score).toBe(0)
    expect(other.best).toBe(0)
    expect(other.carried).toBe(false)
  })

  it('takes the level\'s current speed and paddle, not the ones it was saved with', () => {
    const store = fakeStore()
    const s = newGame(1)
    s.speed = 12
    s.paddle.w = 300
    s.score = 40
    saveMemory(SESSION, { state: s, best: 0, runs: 0 }, store)

    const back = loadMemory(SESSION, store).state
    expect(back.speed).toBe(BREAKER_LEVELS[1].speed)
    expect(back.paddle.w).toBe(BREAKER_LEVELS[1].paddleW)
    expect(back.paddle.x).toBeGreaterThanOrEqual(WALL + back.paddle.w / 2)
    expect(back.paddle.x).toBeLessThanOrEqual(FIELD_W - WALL - back.paddle.w / 2)
  })

  it('resolves a state that was saved in an impossible spot', () => {
    // Out of lives — that is a finished run whatever the status field says.
    const dead = restoreMemory(
      JSON.stringify({ session: SESSION, best: 0, runs: 0, state: { ...newGame(), lives: 0, status: 'ready' } }),
      SESSION,
    )
    expect(dead.state.status).toBe('over')

    // Nothing left to break, on the last level.
    const last = newGame(BREAKER_LEVELS.length - 1)
    const done = restoreMemory(
      JSON.stringify({ session: SESSION, best: 0, runs: 0, state: { ...last, bricks: [] } }),
      SESSION,
    )
    expect(done.state.status).toBe('complete')
  })

  it('falls back to a fresh game rather than throwing on junk', () => {
    for (const raw of [
      null,
      'not json',
      '{}',
      '[]',
      JSON.stringify({ session: SESSION }),
      JSON.stringify({ session: SESSION, state: { levelIndex: 99, status: 'ready' } }),
      JSON.stringify({ session: SESSION, state: { levelIndex: 0, status: 'sideways' } }),
    ]) {
      const m = restoreMemory(raw, SESSION)
      expect(m.state.status).toBe('ready')
      expect(m.state.bricks.length).toBeGreaterThan(0)
      expect(m.carried).toBe(false)
    }
  })

  it('keeps the run when only the bricks are unusable', () => {
    const m = restoreMemory(
      JSON.stringify({
        session: SESSION,
        best: 10,
        runs: 0,
        state: { ...newGame(1), score: 260, lives: 2, bricks: [{ x: 'left', y: 0, w: 1, h: 1, hp: 1, maxHp: 1 }] },
      }),
      SESSION,
    )
    expect(m.state.score).toBe(260)
    expect(m.state.lives).toBe(2)
    expect(m.state.bricks.length).toBe(newGame(1).bricks.length)
  })

  it('clamps stored tallies and lives to something sane', () => {
    const m = restoreMemory(
      JSON.stringify({
        session: SESSION,
        best: -4,
        runs: Number.NaN,
        state: { ...newGame(), lives: 99, score: -12 },
      }),
      SESSION,
    )
    expect(m.state.lives).toBe(LIVES)
    expect(m.state.score).toBe(0)
    expect(m.best).toBe(0)
    expect(m.runs).toBe(0)
  })

  it('works with no storage at all', () => {
    expect(() => saveMemory(SESSION, freshMemory(), null)).not.toThrow()
    expect(loadMemory(SESSION, null).carried).toBe(false)
  })
})
