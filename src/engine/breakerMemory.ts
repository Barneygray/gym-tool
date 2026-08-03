/**
 * What the brick breaker remembers between rests.
 *
 * A rest is ninety seconds; a session is an hour of them. Starting the game
 * from level one every time you tapped it made the run disposable — you'd never
 * see level three, and the score had nothing behind it. So the run belongs to
 * the *workout*, not to the rest: close the game between sets and it picks back
 * up mid-level, with the same lives, the same score and the same half-broken
 * bricks. Start a new workout and it starts over.
 *
 * It lives in localStorage rather than in a ref because the phone is the enemy
 * here: a PWA that's been backgrounded for three sets can be reloaded from
 * scratch by the time you look at it again, and the run should survive that the
 * same way the active workout does.
 */

import {
  BREAKER_LEVELS, FIELD_W, LIVES, WALL,
  buildBricks, movePaddle, newGame, park,
  type Brick, type BreakerState, type BreakerStatus,
} from './breaker'

const STORAGE_KEY = 'forge-breaker-run'

/** The one bit of localStorage this needs, so tests can hand over a fake. */
export interface MemoryStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface BreakerMemory {
  /** The game as the last rest left it, ready to be served again. */
  state: BreakerState
  /** Best run of the session, kept when a run ends and the next starts at zero. */
  best: number
  /** Runs finished this session — out of lives, or every level cleared. */
  runs: number
  /**
   * True when this was picked up rather than started here, and there's
   * something to have picked up. Only the overlay cares: it's the difference
   * between "Brick breaker" and "back where you left it".
   */
  carried: boolean
}

/** What gets written — `carried` is about this visit, not about the run. */
type StoredMemory = Omit<BreakerMemory, 'carried'>

const STATUSES: BreakerStatus[] = ['ready', 'playing', 'level-clear', 'over', 'complete']

/** A session that hasn't played yet. */
export function freshMemory(): BreakerMemory {
  return { state: newGame(), best: 0, runs: 0, carried: false }
}

/**
 * The run stored for `session`, or a fresh one. Anything stored against a
 * different workout is somebody else's rest — it isn't merged, it's replaced.
 */
export function loadMemory(session: string, store: MemoryStore | null = browserStore()): BreakerMemory {
  let raw: string | null = null
  try {
    raw = store?.getItem(STORAGE_KEY) ?? null
  } catch {
    raw = null
  }
  return restoreMemory(raw, session)
}

/** Write the run back, stamped with the workout it belongs to. */
export function saveMemory(
  session: string,
  memory: StoredMemory,
  store: MemoryStore | null = browserStore(),
): void {
  const payload = {
    session,
    // A run in progress can already be the session's best; folding it in on
    // every write means a phone killed mid-rally still remembers the score.
    best: Math.max(memory.best, memory.state.score),
    runs: memory.runs,
    state: memory.state,
  }
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Storage full or blocked — the run just won't outlive this rest.
  }
}

/** Fold a finished run into what the session remembers, and rack up the next. */
export function nextRun(memory: BreakerMemory): BreakerMemory {
  return {
    state: newGame(0),
    best: Math.max(memory.best, memory.state.score),
    runs: memory.runs + 1,
    carried: false,
  }
}

/**
 * Whether the game itself is underway — the test for "you're coming back to
 * something", so a session whose last run ended and was racked up fresh reads
 * as a new game rather than as one you left half-played.
 */
export function hasProgress(memory: BreakerMemory): boolean {
  const s = memory.state
  return s.score > 0 || s.levelIndex > 0 || s.lives < LIVES || s.status !== 'ready'
}

/**
 * Rebuild a run from stored JSON. Everything is treated as untrusted — this is
 * a string a user, an old build or a half-finished write could have put there,
 * and a game that throws on load is worse than one that forgets.
 */
export function restoreMemory(raw: string | null, session: string): BreakerMemory {
  if (raw === null) return freshMemory()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return freshMemory()
  }
  if (!isObj(parsed) || parsed.session !== session) return freshMemory()

  const state = validState(parsed.state)
  if (state === null) return freshMemory()
  const best = Math.max(count(parsed.best), state.score)
  const memory: BreakerMemory = { state, best, runs: count(parsed.runs), carried: true }
  return { ...memory, carried: hasProgress(memory) }
}

/**
 * The stored game, rebuilt field by field. Only what the run *earned* is taken
 * from storage — where it got to, what it broke, what it scored. The level's
 * own numbers (ball speed, paddle width) are read fresh, so a rebalanced level
 * applies to a run in progress instead of being frozen at whatever shipped the
 * day it started.
 */
function validState(v: unknown): BreakerState | null {
  if (!isObj(v)) return null
  const levelIndex = count(v.levelIndex)
  if (levelIndex >= BREAKER_LEVELS.length) return null
  if (!isStatus(v.status)) return null

  const level = BREAKER_LEVELS[levelIndex]
  const lives = Math.min(count(v.lives), LIVES)
  const s: BreakerState = {
    levelIndex,
    status: v.status,
    bricks: validBricks(v.bricks) ?? buildBricks(level),
    ball: { x: FIELD_W / 2, y: 0, vx: 0, vy: 0 },
    paddle: { x: FIELD_W / 2, w: level.paddleW },
    speed: level.speed,
    lives,
    score: count(v.score),
  }

  // Whatever it was doing when you walked off, it isn't doing it now: the ball
  // goes back on the paddle and waits to be served. Nobody wants to come back
  // to a rally already in flight.
  if (s.status === 'playing') s.status = 'ready'
  if (s.lives <= 0) s.status = 'over'
  else if (s.bricks.length === 0 && s.status === 'ready') s.status = clearedStatus(levelIndex)
  movePaddle(s, num(isObj(v.paddle) ? v.paddle.x : undefined) ?? FIELD_W / 2)
  park(s)
  return s
}

/** A level with nothing left on it: the next one, or the end of the game. */
function clearedStatus(levelIndex: number): BreakerStatus {
  return levelIndex + 1 < BREAKER_LEVELS.length ? 'level-clear' : 'complete'
}

/**
 * The bricks still standing. Null when the list is unusable, which the caller
 * answers by laying the level out again — losing the damage you'd done is a
 * far smaller loss than losing the run.
 */
function validBricks(v: unknown): Brick[] | null {
  if (!Array.isArray(v) || v.length > 200) return null
  const bricks: Brick[] = []
  for (const b of v) {
    if (!isObj(b)) return null
    const x = num(b.x), y = num(b.y), w = num(b.w), h = num(b.h)
    const hp = num(b.hp), maxHp = num(b.maxHp)
    if (x === null || y === null || w === null || h === null || hp === null || maxHp === null) return null
    if (w <= 0 || h <= 0 || hp < 1 || hp > maxHp) return null
    if (x < WALL - 0.5 || x + w > FIELD_W - WALL + 0.5) return null
    bricks.push({ x, y, w, h, hp, maxHp })
  }
  return bricks
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const isStatus = (v: unknown): v is BreakerStatus =>
  typeof v === 'string' && (STATUSES as string[]).includes(v)

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** A stored tally: whole, non-negative, and zero when it's anything else. */
const count = (v: unknown): number => {
  const n = num(v)
  return n === null || n < 0 ? 0 : Math.floor(n)
}

/** localStorage, when there is one — the engine's tests run without a window. */
function browserStore(): MemoryStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
