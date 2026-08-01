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
export const LIVES = 3

export interface BreakerLevel {
  name: string
  /** Bricks, one string per row: `.` is a gap, a digit is hits-to-clear. */
  rows: string[]
  /** Ball speed, field units per second. */
  speed: number
  paddleW: number
}

/**
 * Five levels, and they get harder the way a session does: the ball speeds up,
 * the paddle narrows, and the bricks stop dying in one hit. Sized so a level is
 * winnable inside a normal rest — around 15–30 hits, not a hundred.
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
    rows: [
      '11111111',
      '11111111',
    ],
  },
  {
    name: 'Pyramid',
    speed: 185,
    paddleW: 70,
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
    rows: [
      '3.1111.3',
      '.322223.',
      '..1111..',
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
}

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
  ball: { x: number; y: number; vx: number; vy: number }
  paddle: { x: number; w: number }
  speed: number
  lives: number
  score: number
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
      bricks.push({
        x: WALL + c * (bw + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        w: bw,
        h: BRICK_H,
        hp: Number(ch),
        maxHp: Number(ch),
      })
    }
  })
  return bricks
}

/**
 * A level, loaded and parked. Lives and score carry across levels — the run is
 * the unit, not the level.
 */
export function newGame(levelIndex = 0, carry?: { lives: number; score: number }): BreakerState {
  const level = BREAKER_LEVELS[Math.min(levelIndex, BREAKER_LEVELS.length - 1)]
  const s: BreakerState = {
    levelIndex,
    status: 'ready',
    bricks: buildBricks(level),
    ball: { x: FIELD_W / 2, y: 0, vx: 0, vy: 0 },
    paddle: { x: FIELD_W / 2, w: level.paddleW },
    speed: level.speed,
    lives: carry?.lives ?? LIVES,
    score: carry?.score ?? 0,
  }
  park(s)
  return s
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
  s.ball.vx = s.speed * Math.sin(angle)
  s.ball.vy = -s.speed * Math.cos(angle)
  s.status = 'playing'
}

/**
 * Move the run on by `dt` seconds. Broken into substeps no longer than the
 * ball's radius: at 240 units/sec a whole frame is a 4-unit hop, which is
 * enough to pass clean through a 14-unit brick if the frame lands badly.
 */
export function step(s: BreakerState, dt: number): void {
  if (s.status !== 'playing') return
  const travel = Math.hypot(s.ball.vx, s.ball.vy) * dt
  const parts = Math.max(1, Math.ceil(travel / BALL_R))
  for (let i = 0; i < parts && s.status === 'playing'; i++) substep(s, dt / parts)
}

function substep(s: BreakerState, dt: number): void {
  const b = s.ball
  b.x += b.vx * dt
  b.y += b.vy * dt

  // Walls. The top is a wall too; the bottom is the way you lose.
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

  hitBricks(s)
  hitPaddle(s)

  if (b.y - BALL_R > FIELD_H) loseBall(s)
}

function hitBricks(s: BreakerState): void {
  const b = s.ball
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

    k.hp--
    s.score += 10
    if (k.hp <= 0) {
      s.bricks.splice(i, 1)
      s.score += 15
    }
    if (s.bricks.length === 0) {
      s.status = s.levelIndex + 1 < BREAKER_LEVELS.length ? 'level-clear' : 'complete'
    }
    return // one brick per substep — enough, and it keeps corners sane
  }
}

function hitPaddle(s: BreakerState): void {
  const b = s.ball
  const half = s.paddle.w / 2
  if (b.vy <= 0) return
  if (b.y + BALL_R < PADDLE_Y || b.y - BALL_R > PADDLE_Y + PADDLE_H) return
  if (Math.abs(b.x - s.paddle.x) > half + BALL_R) return

  // Where on the paddle it lands sets the angle — the paddle is the only
  // steering you get, so the edges have to mean something.
  const off = clamp((b.x - s.paddle.x) / half, -1, 1)
  const angle = off * MAX_BOUNCE
  b.y = PADDLE_Y - BALL_R
  b.vx = s.speed * Math.sin(angle)
  b.vy = -s.speed * Math.cos(angle)
}

function loseBall(s: BreakerState): void {
  s.lives--
  if (s.lives <= 0) {
    s.lives = 0
    s.status = 'over'
    return
  }
  s.status = 'ready'
  park(s)
}

/** Rest the ball on the paddle, stationary. */
export function park(s: BreakerState): void {
  s.ball.x = s.paddle.x
  s.ball.y = PADDLE_Y - BALL_R - 1
  s.ball.vx = 0
  s.ball.vy = 0
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
