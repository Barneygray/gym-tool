/**
 * Brick breaker — what to do with the ninety seconds you're not allowed to
 * spend lifting. It lives in the engine rather than the component because the
 * interesting half of a game is arithmetic: where the bricks are, where the
 * ball goes next, and when a level is over. The component only draws it.
 *
 * Everything below works in *field units* — a fixed 320×420 coordinate space
 * the canvas scales to whatever the phone gives it, so the geometry never has
 * to care how wide the screen is.
 */

export const FIELD_W = 320
export const FIELD_H = 420

/** Side gutters. The play field is inset from the canvas edge on three sides. */
export const WALL = 8
const BRICK_TOP = 34
const BRICK_GAP = 4
const BRICK_H = 14

export const PADDLE_Y = FIELD_H - 26
export const PADDLE_H = 8
export const BALL_R = 4.5

/** Steepest launch/bounce angle off the vertical — beyond this a rally stalls. */
const MAX_BOUNCE = 1.05
/**
 * And the shallowest. A ball returned dead straight up an emptied column
 * bounces between the paddle and the ceiling forever, touching nothing, and
 * the narrow lanes the later levels are built from make that easy to fall
 * into. Four degrees is invisible to look at and drifts a couple of brick
 * widths per round trip, which is all it takes to get out.
 */
const MIN_BOUNCE = 0.07
export const LIVES = 3
/** Extra lives are catchable, so the counter needs a ceiling to draw against. */
export const MAX_LIVES = 5
/** Enough balls for multiball to feel like an event, few enough to still read. */
export const MAX_BALLS = 5

/* ── Abilities ──────────────────────────────────────────────────────────
   A brick that dies can leave something behind, and it falls: you have to
   go and get it with the same paddle you're keeping the ball up with. That
   tension is the whole point — half of them you want, and from the fourth
   level on, some of them you don't. */

export type AbilityKind = 'wide' | 'slow' | 'multi' | 'laser' | 'life' | 'shrink' | 'fast'

export interface Ability {
  kind: AbilityKind
  /** One character, drawn on the falling capsule. */
  glyph: string
  /** What the HUD calls it. */
  name: string
  /** Worth going for. The rest are to be dodged. */
  good: boolean
  /** Seconds it runs for, or 0 when it lands all at once. */
  duration: number
  /** Relative chance of being the one that falls. */
  weight: number
}

export const ABILITIES: Record<AbilityKind, Ability> = {
  wide: { kind: 'wide', glyph: 'W', name: 'Wide paddle', good: true, duration: 12, weight: 5 },
  slow: { kind: 'slow', glyph: 'S', name: 'Slow ball', good: true, duration: 10, weight: 4 },
  multi: { kind: 'multi', glyph: 'M', name: 'Multiball', good: true, duration: 0, weight: 4 },
  laser: { kind: 'laser', glyph: 'L', name: 'Lasers', good: true, duration: 9, weight: 4 },
  life: { kind: 'life', glyph: '+', name: 'Extra life', good: true, duration: 0, weight: 2 },
  shrink: { kind: 'shrink', glyph: 'N', name: 'Narrow paddle', good: false, duration: 10, weight: 3 },
  fast: { kind: 'fast', glyph: 'F', name: 'Fast ball', good: false, duration: 8, weight: 3 },
}

export const ABILITY_KINDS = Object.keys(ABILITIES) as AbilityKind[]

/** Two pairs cancel rather than stack — you can't be wide *and* narrow. */
const OPPOSITE: Partial<Record<AbilityKind, AbilityKind>> = {
  wide: 'shrink', shrink: 'wide', slow: 'fast', fast: 'slow',
}

const WIDE_MUL = 1.35
const NARROW_MUL = 0.72
const SLOW_MUL = 0.78
const FAST_MUL = 1.28

/** Capsules fall slower than the ball, so chasing one is a decision. */
export const DROP_W = 18
export const DROP_H = 9
const DROP_SPEED = 105

export const BOLT_W = 2
export const BOLT_H = 9
const BOLT_SPEED = 330
/** Seconds between volleys — lasers are a help, not a delete button. */
const RELOAD = 0.26
const MAX_BOLTS = 12

export interface BreakerLevel {
  name: string
  /**
   * Bricks, one string per row: `.` is a gap, a digit is hits-to-clear, and
   * `*` is steel — it never breaks, and it never has to be broken to clear
   * the level. It's just in the way.
   */
  rows: string[]
  /** Ball speed, field units per second. */
  speed: number
  paddleW: number
  /** Chance a destroyed brick leaves an ability behind. */
  drop: number
  /** Whether the bad abilities are in the pool too. */
  hazards: boolean
}

/**
 * Ten levels, and they get harder the way a session does: the ball speeds up,
 * the paddle narrows, the bricks stop dying in one hit, and steel starts
 * showing up in the middle of the field. Sized so a level is winnable inside a
 * normal rest — the abilities are what keep the later ones from being a slog,
 * so those clear a good deal faster than their brick count suggests.
 *
 * Speeds run about a tenth quicker than they first shipped at: the opening
 * level was slow enough to feel like waiting, which is the one thing the rest
 * clock already has covered.
 */
export const BREAKER_LEVELS: BreakerLevel[] = [
  {
    name: 'Warm-up set',
    speed: 165,
    paddleW: 76,
    drop: 0.18,
    hazards: false,
    rows: [
      '11111111',
      '11111111',
    ],
  },
  {
    name: 'Pyramid',
    speed: 185,
    paddleW: 70,
    drop: 0.2,
    hazards: false,
    rows: [
      '.222222.',
      '..1111..',
      '...11...',
    ],
  },
  {
    name: 'Drop set',
    speed: 202,
    paddleW: 64,
    drop: 0.22,
    hazards: false,
    rows: [
      '1.1.1.1.',
      '.2.2.2.2',
      '1.1.1.1.',
    ],
  },
  {
    name: 'Superset',
    speed: 220,
    paddleW: 58,
    drop: 0.25,
    hazards: true,
    rows: [
      '.111111.',
      '.322223.',
      '.111111.',
    ],
  },
  {
    name: 'To failure',
    speed: 240,
    paddleW: 52,
    drop: 0.28,
    hazards: true,
    rows: [
      '3.1111.3',
      '.322223.',
      '..1111..',
    ],
  },
  // ── Past here the field starts fighting back: steel in the corners, then
  // in the lanes, then across the middle.
  {
    name: 'Rest-pause',
    speed: 252,
    paddleW: 50,
    drop: 0.3,
    hazards: true,
    rows: [
      '*111111*',
      '.322223.',
      '..1221..',
    ],
  },
  {
    name: 'Negatives',
    speed: 262,
    paddleW: 48,
    drop: 0.32,
    hazards: true,
    rows: [
      '3.2222.3',
      '.*3223*.',
      '.121121.',
    ],
  },
  {
    name: 'Cluster set',
    speed: 272,
    paddleW: 46,
    drop: 0.34,
    hazards: true,
    rows: [
      '4.1111.4',
      '.*3223*.',
      '.221122.',
      '...11...',
    ],
  },
  {
    name: 'Max effort',
    speed: 282,
    paddleW: 44,
    drop: 0.36,
    hazards: true,
    rows: [
      '*332233*',
      '.4.11.4.',
      '..1221..',
    ],
  },
  {
    name: 'The wall',
    speed: 295,
    paddleW: 42,
    drop: 0.38,
    hazards: true,
    rows: [
      '*4.22.4*',
      '.334433.',
      '..*11*..',
    ],
  },
]

export interface Brick {
  x: number
  y: number
  w: number
  h: number
  /** Hits left. Bricks are drawn by *current* hp, so damage shows. */
  hp: number
  maxHp: number
  /** Steel: takes hits without caring, and doesn't count towards clearing. */
  solid: boolean
}

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
}

/** An ability on its way down, waiting to be caught or missed. */
export interface Drop {
  x: number
  y: number
  kind: AbilityKind
}

/** A laser bolt on its way up. */
export interface Bolt {
  x: number
  y: number
}

/** Seconds left on each timed ability that's currently running. */
export type Effects = Partial<Record<AbilityKind, number>>

export type BreakerStatus =
  /** Ball parked on the paddle, waiting for a tap. */
  | 'ready'
  | 'playing'
  /** Last brick gone, more levels to come. */
  | 'level-clear'
  /** Out of lives. */
  | 'over'
  /** Every level cleared. */
  | 'complete'

export interface BreakerState {
  levelIndex: number
  status: BreakerStatus
  bricks: Brick[]
  /** Usually one. Multiball is the reason this is a list. */
  balls: Ball[]
  drops: Drop[]
  bolts: Bolt[]
  effects: Effects
  paddle: { x: number; w: number }
  /** The level's own ball speed — what the ball *actually* travels at is `speedOf`. */
  speed: number
  lives: number
  score: number
  /** Seconds until the paddle can fire again. */
  reload: number
  /**
   * This parked ball is one you just dropped, rather than one you haven't
   * served yet. Lives alone can't tell you — the extra-life ability means a
   * run can be back down to three having lost one.
   */
  dropped: boolean
}

/** The level a run is on, however far past the end of the list it claims to be. */
export function levelOf(s: { levelIndex: number }): BreakerLevel {
  return BREAKER_LEVELS[Math.min(Math.max(s.levelIndex, 0), BREAKER_LEVELS.length - 1)]
}

/** Lay a level's rows out across the field. */
export function buildBricks(level: BreakerLevel): Brick[] {
  const cols = level.rows[0]?.length ?? 0
  const bw = (FIELD_W - WALL * 2 - BRICK_GAP * (cols - 1)) / cols
  const bricks: Brick[] = []
  level.rows.forEach((row, r) => {
    for (let c = 0; c < cols; c++) {
      const ch = row[c]
      if (!ch || ch === '.') continue
      const solid = ch === '*'
      bricks.push({
        x: WALL + c * (bw + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        w: bw,
        h: BRICK_H,
        hp: solid ? 1 : Number(ch),
        maxHp: solid ? 1 : Number(ch),
        solid,
      })
    }
  })
  return bricks
}

/**
 * A level, loaded and parked. Lives and score carry across levels — the run is
 * the unit, not the level. Abilities do not: whatever you were holding when
 * the last brick went is spent, and the next level starts on its own terms.
 */
export function newGame(levelIndex = 0, carry?: { lives: number; score: number }): BreakerState {
  const level = levelOf({ levelIndex })
  const s: BreakerState = {
    levelIndex,
    status: 'ready',
    bricks: buildBricks(level),
    balls: [],
    drops: [],
    bolts: [],
    effects: {},
    paddle: { x: FIELD_W / 2, w: level.paddleW },
    speed: level.speed,
    lives: carry?.lives ?? LIVES,
    score: carry?.score ?? 0,
    reload: 0,
    dropped: false,
  }
  park(s)
  return s
}

/** Paddle width as it stands, level base plus whatever's running. */
export function paddleWidthOf(s: BreakerState): number {
  let w = levelOf(s).paddleW
  if (s.effects.wide) w *= WIDE_MUL
  if (s.effects.shrink) w *= NARROW_MUL
  return Math.round(w * 10) / 10
}

/** Ball speed as it stands, level base plus whatever's running. */
export function speedOf(s: BreakerState): number {
  let v = s.speed
  if (s.effects.slow) v *= SLOW_MUL
  if (s.effects.fast) v *= FAST_MUL
  return v
}

/** Slide the paddle, clamped to the gutters, taking the parked ball with it. */
export function movePaddle(s: BreakerState, x: number): void {
  const half = s.paddle.w / 2
  s.paddle.x = clamp(x, WALL + half, FIELD_W - WALL - half)
  if (s.status === 'ready') park(s)
}

/**
 * Send the ball off the paddle. The angle leans towards whichever side of
 * centre the paddle is sitting on, so a launch is never a straight vertical
 * rally you can't influence.
 */
export function launch(s: BreakerState, rand: () => number = Math.random): void {
  if (s.status !== 'ready') return
  const bias = (s.paddle.x - FIELD_W / 2) / (FIELD_W / 2)
  const angle = clamp(bias * 0.5 + (rand() - 0.5) * 0.4, -0.7, 0.7)
  const v = speedOf(s)
  for (const b of s.balls) {
    b.vx = v * Math.sin(angle)
    b.vy = -v * Math.cos(angle)
  }
  s.status = 'playing'
  s.dropped = false
}

/**
 * Fire the lasers, if you have them and they've cooled down. Two bolts, one
 * off each end of the paddle. Returns whether anything actually went out, so
 * the caller can fall through to whatever a tap means otherwise.
 */
export function fire(s: BreakerState): boolean {
  if (s.status !== 'playing' || !s.effects.laser) return false
  if (s.reload > 0 || s.bolts.length >= MAX_BOLTS) return false
  const off = Math.min(s.paddle.w / 2 - 2, 14)
  s.bolts.push({ x: s.paddle.x - off, y: PADDLE_Y }, { x: s.paddle.x + off, y: PADDLE_Y })
  s.reload = RELOAD
  return true
}

/**
 * Move the run on by `dt` seconds. Broken into substeps no longer than the
 * ball's radius: at 240 units/sec a whole frame is a 4-unit hop, which is
 * enough to pass clean through a 14-unit brick if the frame lands badly.
 */
export function step(s: BreakerState, dt: number, rand: () => number = Math.random): void {
  if (s.status !== 'playing') return
  tick(s, dt)
  // Bolts outrun the ball, so they set the substep size when they're up.
  const fastest = Math.max(speedOf(s), s.bolts.length ? BOLT_SPEED : 0)
  const parts = Math.max(1, Math.ceil((fastest * dt) / BALL_R))
  for (let i = 0; i < parts && s.status === 'playing'; i++) substep(s, dt / parts, rand)
}

/**
 * Run the clocks down. Abilities expire on their own, and when one does the
 * paddle and the ball go back to the level's own numbers immediately.
 */
function tick(s: BreakerState, dt: number): void {
  s.reload = Math.max(0, s.reload - dt)
  let changed = false
  for (const kind of Object.keys(s.effects) as AbilityKind[]) {
    const left = (s.effects[kind] ?? 0) - dt
    if (left > 0) {
      s.effects[kind] = left
    } else {
      delete s.effects[kind]
      changed = true
    }
  }
  if (changed) resync(s)
}

/** Put the paddle and the balls back in step with whatever's running now. */
function resync(s: BreakerState): void {
  s.paddle.w = paddleWidthOf(s)
  movePaddle(s, s.paddle.x)
  const v = speedOf(s)
  for (const b of s.balls) {
    const mag = Math.hypot(b.vx, b.vy)
    if (mag === 0) continue
    b.vx = (b.vx / mag) * v
    b.vy = (b.vy / mag) * v
  }
}

function substep(s: BreakerState, dt: number, rand: () => number): void {
  for (let i = s.balls.length - 1; i >= 0; i--) {
    moveBall(s, s.balls[i], dt, rand)
    // The bottom of the field is the way you lose — but only the last ball
    // out costs anything.
    if (s.balls[i].y - BALL_R > FIELD_H) s.balls.splice(i, 1)
  }
  if (s.balls.length === 0) {
    loseBall(s)
    return
  }
  moveDrops(s, dt)
  moveBolts(s, dt, rand)
}

function moveBall(s: BreakerState, b: Ball, dt: number, rand: () => number): void {
  b.x += b.vx * dt
  b.y += b.vy * dt

  // Walls. The top is a wall too; the bottom is handled by the caller.
  if (b.x - BALL_R < WALL) {
    b.x = WALL + BALL_R
    b.vx = Math.abs(b.vx)
  } else if (b.x + BALL_R > FIELD_W - WALL) {
    b.x = FIELD_W - WALL - BALL_R
    b.vx = -Math.abs(b.vx)
  }
  if (b.y - BALL_R < 0) {
    b.y = BALL_R
    b.vy = Math.abs(b.vy)
  }

  hitBricks(s, b, rand)
  hitPaddle(s, b)
}

function hitBricks(s: BreakerState, b: Ball, rand: () => number): void {
  for (let i = 0; i < s.bricks.length; i++) {
    const k = s.bricks[i]
    const nearX = clamp(b.x, k.x, k.x + k.w)
    const nearY = clamp(b.y, k.y, k.y + k.h)
    const dx = b.x - nearX
    const dy = b.y - nearY
    if (dx * dx + dy * dy > BALL_R * BALL_R) continue

    // Reflect off whichever face the ball is least far through: a corner
    // clip should turn it sideways, a face hit should send it back.
    const overX = k.w / 2 + BALL_R - Math.abs(b.x - (k.x + k.w / 2))
    const overY = k.h / 2 + BALL_R - Math.abs(b.y - (k.y + k.h / 2))
    if (overX < overY) {
      b.vx = -b.vx
      b.x += b.x < k.x + k.w / 2 ? -overX : overX
    } else {
      b.vy = -b.vy
      b.y += b.y < k.y + k.h / 2 ? -overY : overY
    }

    damage(s, i, rand)
    return // one brick per substep — enough, and it keeps corners sane
  }
}

/**
 * Take a hit off brick `i`, and deal with what's left. Steel rings and stays
 * put; anything else may leave an ability behind on the way out.
 */
function damage(s: BreakerState, i: number, rand: () => number): void {
  const k = s.bricks[i]
  if (k.solid) {
    s.score += 2
    return
  }
  k.hp--
  s.score += 10
  if (k.hp <= 0) {
    s.bricks.splice(i, 1)
    s.score += 15
    const level = levelOf(s)
    if (rand() < level.drop) {
      s.drops.push({
        x: k.x + k.w / 2,
        y: k.y + k.h / 2,
        kind: pickAbility(rand, level.hazards),
      })
    }
  }
  // Steel is scenery: a level is clear when the breakable bricks are gone.
  if (!s.bricks.some((brick) => !brick.solid)) {
    s.status = s.levelIndex + 1 < BREAKER_LEVELS.length ? 'level-clear' : 'complete'
  }
}

/** Weighted draw from the pool this level is playing with. */
export function pickAbility(rand: () => number, hazards: boolean): AbilityKind {
  const pool = hazards ? ABILITY_KINDS : ABILITY_KINDS.filter((k) => ABILITIES[k].good)
  const total = pool.reduce((n, k) => n + ABILITIES[k].weight, 0)
  let roll = rand() * total
  for (const k of pool) {
    roll -= ABILITIES[k].weight
    if (roll <= 0) return k
  }
  return pool[pool.length - 1]
}

function hitPaddle(s: BreakerState, b: Ball): void {
  const half = s.paddle.w / 2
  if (b.vy <= 0) return
  if (b.y + BALL_R < PADDLE_Y || b.y - BALL_R > PADDLE_Y + PADDLE_H) return
  if (Math.abs(b.x - s.paddle.x) > half + BALL_R) return

  // Where on the paddle it lands sets the angle — the paddle is the only
  // steering you get, so the edges have to mean something.
  const off = clamp((b.x - s.paddle.x) / half, -1, 1)
  let angle = off * MAX_BOUNCE
  if (Math.abs(angle) < MIN_BOUNCE) {
    // Keep whichever way it was already leaning, so the floor reads as the
    // ball carrying on rather than as the paddle flicking it.
    const lean = off !== 0 ? off : b.vx
    angle = (lean < 0 ? -1 : 1) * MIN_BOUNCE
  }
  const v = speedOf(s)
  b.y = PADDLE_Y - BALL_R
  b.vx = v * Math.sin(angle)
  b.vy = -v * Math.cos(angle)
}

function moveDrops(s: BreakerState, dt: number): void {
  const half = s.paddle.w / 2
  for (let i = s.drops.length - 1; i >= 0; i--) {
    const d = s.drops[i]
    d.y += DROP_SPEED * dt
    const caught =
      d.y + DROP_H / 2 >= PADDLE_Y &&
      d.y - DROP_H / 2 <= PADDLE_Y + PADDLE_H &&
      Math.abs(d.x - s.paddle.x) <= half + DROP_W / 2
    if (caught) {
      s.drops.splice(i, 1)
      collect(s, d.kind)
    } else if (d.y - DROP_H / 2 > FIELD_H) {
      s.drops.splice(i, 1)
    }
  }
}

function moveBolts(s: BreakerState, dt: number, rand: () => number): void {
  for (let i = s.bolts.length - 1; i >= 0; i--) {
    const bolt = s.bolts[i]
    bolt.y -= BOLT_SPEED * dt
    if (bolt.y + BOLT_H < 0) {
      s.bolts.splice(i, 1)
      continue
    }
    const hit = s.bricks.findIndex(
      (k) =>
        bolt.x >= k.x && bolt.x <= k.x + k.w &&
        bolt.y <= k.y + k.h && bolt.y + BOLT_H >= k.y,
    )
    if (hit === -1) continue
    s.bolts.splice(i, 1)
    damage(s, hit, rand)
    if (s.status !== 'playing') return
  }
}

/**
 * Take an ability. Timed ones start their clock (and cancel their opposite,
 * because being wide and narrow at once is nonsense); the other two land
 * straight away.
 */
export function collect(s: BreakerState, kind: AbilityKind): void {
  const ability = ABILITIES[kind]
  if (ability.good) s.score += 25

  if (kind === 'life') {
    s.lives = Math.min(MAX_LIVES, s.lives + 1)
    return
  }
  if (kind === 'multi') {
    split(s)
    return
  }

  const opposite = OPPOSITE[kind]
  if (opposite) delete s.effects[opposite]
  s.effects[kind] = ability.duration
  resync(s)
}

/** Fan every ball in play out into three, up to the ceiling. */
function split(s: BreakerState): void {
  const born: Ball[] = []
  for (const b of s.balls) {
    for (const turn of [0.4, -0.4]) {
      if (s.balls.length + born.length >= MAX_BALLS) break
      const cos = Math.cos(turn)
      const sin = Math.sin(turn)
      born.push({ x: b.x, y: b.y, vx: b.vx * cos - b.vy * sin, vy: b.vx * sin + b.vy * cos })
    }
  }
  s.balls.push(...born)
}

/**
 * The last ball is gone. A life goes with it, and so does everything you were
 * holding — you come back to the level, not to the situation.
 */
function loseBall(s: BreakerState): void {
  s.lives--
  s.dropped = true
  s.effects = {}
  s.drops = []
  s.bolts = []
  s.reload = 0
  s.paddle.w = paddleWidthOf(s)
  if (s.lives <= 0) {
    s.lives = 0
    s.status = 'over'
    return
  }
  s.status = 'ready'
  movePaddle(s, s.paddle.x)
  park(s)
}

/** Rest one ball on the paddle, stationary, and clear the rest away. */
export function park(s: BreakerState): void {
  s.balls = [{ x: s.paddle.x, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0 }]
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
