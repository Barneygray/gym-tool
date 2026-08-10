import { describe, it, expect } from 'vitest'
import {
  ABILITIES, ABILITY_KINDS, BALL_R, BREAKER_LEVELS, DROP_W, FIELD_H, FIELD_W,
  MAX_BALLS, MAX_LIVES, PADDLE_H, PADDLE_Y, WALL,
  buildBricks, collect, fire, launch, movePaddle, newGame, paddleWidthOf,
  pickAbility, speedOf, step, type BreakerState,
} from './breaker'

/** The first five levels are the ones that predate abilities. */
const OPENING = 5

/** Nothing ever drops — the roll is `rand() < level.drop`. */
const NO_DROPS = () => 1

/** Run the game forward at a steady 60fps for `seconds`, dropping nothing. */
function play(s: BreakerState, seconds: number, rand: () => number = NO_DROPS): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) step(s, 1 / 60, rand)
}

/** The ball, for the levels' worth of tests that only ever have one. */
const ball = (s: BreakerState) => s.balls[0]

/** Point the one ball straight up at the underside of a brick, touching it. */
function aimAt(s: BreakerState, i: number): void {
  const k = s.bricks[i]
  s.balls = [{
    x: k.x + k.w / 2,
    y: k.y + k.h + BALL_R - 0.5,
    vx: 0,
    vy: -speedOf(s),
  }]
}

describe('brick breaker levels', () => {
  it('has ten of them, each with bricks laid out on a rectangular grid', () => {
    expect(BREAKER_LEVELS.length).toBe(10)
    for (const level of BREAKER_LEVELS) {
      expect(level.rows.length).toBeGreaterThan(0)
      const cols = level.rows[0].length
      for (const row of level.rows) {
        expect(row.length).toBe(cols)
        expect(row).toMatch(/^[.1-4*]+$/)
      }
      expect(buildBricks(level).length).toBeGreaterThan(0)
      expect(level.drop).toBeGreaterThan(0)
      expect(level.drop).toBeLessThan(1)
    }
  })

  it('gets harder as it goes — faster ball, narrower paddle, more falling', () => {
    for (let i = 1; i < BREAKER_LEVELS.length; i++) {
      expect(BREAKER_LEVELS[i].speed).toBeGreaterThan(BREAKER_LEVELS[i - 1].speed)
      expect(BREAKER_LEVELS[i].paddleW).toBeLessThan(BREAKER_LEVELS[i - 1].paddleW)
      expect(BREAKER_LEVELS[i].drop).toBeGreaterThanOrEqual(BREAKER_LEVELS[i - 1].drop)
    }
    // The paddle can narrow a long way, but never past a handful of ball widths.
    for (const level of BREAKER_LEVELS) expect(level.paddleW).toBeGreaterThan(BALL_R * 8)
  })

  it('keeps the easy levels free of hazards and gives every level something to break', () => {
    for (const [i, level] of BREAKER_LEVELS.entries()) {
      expect(level.hazards).toBe(i >= 3)
      expect(buildBricks(level).some((b) => !b.solid)).toBe(true)
    }
  })

  it('holds steel back for the levels that have earned it', () => {
    const steel = BREAKER_LEVELS.map((l) => buildBricks(l).filter((b) => b.solid).length)
    expect(steel.slice(0, OPENING).every((n) => n === 0)).toBe(true)
    expect(steel.slice(OPENING).every((n) => n > 0)).toBe(true)
  })

  it('keeps every brick inside the play field', () => {
    for (const level of BREAKER_LEVELS) {
      for (const b of buildBricks(level)) {
        expect(b.x).toBeGreaterThanOrEqual(WALL - 0.001)
        expect(b.x + b.w).toBeLessThanOrEqual(FIELD_W - WALL + 0.001)
        expect(b.y + b.h).toBeLessThan(PADDLE_Y)
      }
    }
  })

  it('stays winnable inside a normal rest — no level is a marathon', () => {
    for (const [i, level] of BREAKER_LEVELS.entries()) {
      // Steel is scenery; it never has to be hit, so it doesn't count.
      const hits = buildBricks(level).filter((b) => !b.solid).reduce((n, b) => n + b.hp, 0)
      // The later levels lean on multiball and lasers to clear faster than
      // their brick count reads, so they get more headroom — but not much.
      expect(hits).toBeLessThanOrEqual(i < OPENING ? 30 : 36)
    }
  })
})

describe('brick breaker play', () => {
  it('parks the ball on the paddle until it is launched', () => {
    const s = newGame()
    expect(s.status).toBe('ready')
    movePaddle(s, 100)
    play(s, 1)
    expect(ball(s).x).toBe(100)
    expect(ball(s).y).toBeLessThan(PADDLE_Y)
    expect(ball(s).vy).toBe(0)

    launch(s, () => 0.5)
    expect(s.status).toBe('playing')
    expect(ball(s).vy).toBeLessThan(0)
  })

  it('clamps the paddle to the gutters', () => {
    const s = newGame()
    movePaddle(s, -400)
    expect(s.paddle.x).toBeCloseTo(WALL + s.paddle.w / 2)
    movePaddle(s, 9999)
    expect(s.paddle.x).toBeCloseTo(FIELD_W - WALL - s.paddle.w / 2)
  })

  it('keeps the ball inside the walls however long the rally runs', () => {
    const s = newGame()
    launch(s, () => 0.9)
    for (let i = 0; i < 60 * 30; i++) {
      step(s, 1 / 60, NO_DROPS)
      // Track the ball so it never drops, and watch the box the whole time.
      movePaddle(s, ball(s).x)
      expect(ball(s).x).toBeGreaterThanOrEqual(WALL - 0.001)
      expect(ball(s).x).toBeLessThanOrEqual(FIELD_W - WALL + 0.001)
      expect(ball(s).y).toBeGreaterThanOrEqual(-0.001)
      if (s.status !== 'playing') break
    }
  })

  it('does not tunnel through bricks at the fastest level speed', () => {
    const s = newGame(BREAKER_LEVELS.length - 1)
    const total = s.bricks.length
    launch(s, () => 0.5)
    for (let i = 0; i < 60 * 20 && s.status === 'playing'; i++) {
      step(s, 1 / 60, NO_DROPS)
      movePaddle(s, ball(s).x)
    }
    expect(s.bricks.length).toBeLessThan(total)
  })

  it('bounces off the paddle, and off its edges at an angle', () => {
    const s = newGame()
    movePaddle(s, FIELD_W / 2)
    launch(s, () => 0.5)
    s.balls = [{
      x: s.paddle.x + s.paddle.w / 2 - 1,
      y: PADDLE_Y - BALL_R - 1,
      vx: 0,
      vy: s.speed,
    }]
    step(s, 1 / 60, NO_DROPS)
    expect(ball(s).vy).toBeLessThan(0)
    expect(ball(s).vx).toBeGreaterThan(0)
  })

  it('never returns the ball dead straight, so a rally cannot lock vertical', () => {
    const s = newGame()
    // An empty column with the paddle exactly under the ball: the one shape
    // where a perfectly vertical return bounces forever, touching nothing.
    s.bricks = []
    s.status = 'playing'
    movePaddle(s, FIELD_W / 2)
    s.balls = [{ x: FIELD_W / 2, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: s.speed }]
    step(s, 1 / 60, NO_DROPS)
    expect(ball(s).vy).toBeLessThan(0)
    expect(Math.abs(ball(s).vx)).toBeGreaterThan(0)
    // Shallow enough that it still reads as going straight up.
    expect(Math.abs(ball(s).vx)).toBeLessThan(speedOf(s) * 0.2)

    // And it drifts far enough to leave the column it was stuck in.
    const startX = ball(s).x
    for (let i = 0; i < 60 * 4 && s.status === 'playing'; i++) {
      step(s, 1 / 60, NO_DROPS)
      movePaddle(s, ball(s).x)
    }
    expect(Math.abs(ball(s).x - startX)).toBeGreaterThan(20)
  })

  it('spends a life when the ball drops, and ends the run at zero', () => {
    const s = newGame()
    const drop = () => {
      s.status = 'playing'
      s.balls = [{ x: FIELD_W / 2, y: FIELD_H, vx: 0, vy: s.speed }]
      step(s, 1, NO_DROPS)
    }
    expect(s.dropped).toBe(false)
    drop()
    expect(s.lives).toBe(2)
    expect(s.status).toBe('ready')
    // A parked ball you just lost is not a parked ball you haven't served,
    // and lives alone stop being able to tell them apart once one is catchable.
    expect(s.dropped).toBe(true)
    launch(s, () => 0.5)
    expect(s.dropped).toBe(false)

    drop()
    drop()
    expect(s.lives).toBe(0)
    expect(s.status).toBe('over')
  })

  it('clears to the next level, and calls the last one complete', () => {
    const s = newGame()
    s.bricks = s.bricks.slice(0, 1)
    s.bricks[0].hp = 1
    launch(s, () => 0.5)
    aimAt(s, 0)
    step(s, 1 / 60, NO_DROPS)
    expect(s.bricks).toHaveLength(0)
    expect(s.status).toBe('level-clear')
    expect(s.score).toBeGreaterThan(0)

    const last = newGame(BREAKER_LEVELS.length - 1, { lives: 1, score: 500 })
    last.status = 'playing'
    last.bricks = [{ x: FIELD_W / 2 - 10, y: 100, w: 20, h: 14, hp: 1, maxHp: 1, solid: false }]
    aimAt(last, 0)
    step(last, 1 / 60, NO_DROPS)
    expect(last.status).toBe('complete')
    expect(last.score).toBeGreaterThan(500)
  })

  it('carries lives and score into the next level', () => {
    const s = newGame(1, { lives: 2, score: 340 })
    expect(s.lives).toBe(2)
    expect(s.score).toBe(340)
    expect(s.paddle.w).toBe(BREAKER_LEVELS[1].paddleW)
  })

  it('stands still while it is not being played', () => {
    const s = newGame()
    const before = s.balls.map((b) => ({ ...b }))
    play(s, 2)
    expect(s.balls).toEqual(before)
  })
})

describe('brick breaker steel', () => {
  it('rings off steel without ever breaking it', () => {
    const s = newGame(BREAKER_LEVELS.length - 1)
    const steel = s.bricks.findIndex((b) => b.solid)
    expect(steel).toBeGreaterThanOrEqual(0)
    s.bricks = [s.bricks[steel], ...s.bricks.filter((b) => !b.solid).slice(0, 1)]
    s.status = 'playing'
    aimAt(s, 0)
    step(s, 1 / 60, NO_DROPS)
    expect(s.bricks[0].solid).toBe(true)
    expect(s.bricks[0].hp).toBe(1)
    expect(ball(s).vy).toBeGreaterThan(0)
  })

  it('clears a level once the breakable bricks are gone, steel or not', () => {
    const s = newGame(BREAKER_LEVELS.length - 1)
    const steel = s.bricks.find((b) => b.solid)!
    const soft = s.bricks.find((b) => !b.solid)!
    soft.hp = 1
    s.bricks = [steel, soft]
    s.status = 'playing'
    aimAt(s, 1)
    step(s, 1 / 60, NO_DROPS)
    expect(s.bricks).toEqual([steel])
    expect(s.status).toBe('complete')
  })
})

describe('brick breaker abilities', () => {
  it('drops something from a broken brick at the level\'s rate, and nothing from steel', () => {
    const s = newGame(BREAKER_LEVELS.length - 1)
    const steel = s.bricks.find((b) => b.solid)!
    const soft = s.bricks.find((b) => !b.solid)!
    soft.hp = 1
    s.bricks = [steel, soft, { ...soft, x: WALL, y: 200 }]
    s.status = 'playing'

    aimAt(s, 1)
    step(s, 1 / 60, () => 0) // always drops, and always picks the first ability
    expect(s.drops).toHaveLength(1)
    // It appears where the brick was and is already on its way down.
    expect(s.drops[0].x).toBeCloseTo(soft.x + soft.w / 2, 3)
    expect(s.drops[0].y).toBeGreaterThanOrEqual(soft.y + soft.h / 2)
    expect(s.drops[0].y).toBeLessThan(soft.y + soft.h + 4)

    s.drops = []
    aimAt(s, 0) // the steel one
    step(s, 1 / 60, () => 0)
    expect(s.drops).toHaveLength(0)
  })

  it('never drops a hazard on a level that does not have them', () => {
    for (const roll of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.999]) {
      expect(ABILITIES[pickAbility(() => roll, false)].good).toBe(true)
    }
    // With hazards on, the pool is wider — every ability is reachable.
    const seen = new Set(
      Array.from({ length: 200 }, (_, i) => pickAbility(() => i / 200, true)),
    )
    expect(seen.size).toBe(ABILITY_KINDS.length)
  })

  it('falls down the field, and is caught by the paddle it lands on', () => {
    const s = newGame()
    s.status = 'playing'
    s.balls = [{ x: FIELD_W / 2, y: 60, vx: 0, vy: -s.speed }]
    movePaddle(s, FIELD_W / 2)
    s.drops = [{ x: FIELD_W / 2, y: PADDLE_Y - 80, kind: 'wide' }]

    play(s, 0.2)
    expect(s.drops[0].y).toBeGreaterThan(PADDLE_Y - 80)
    play(s, 2)
    expect(s.drops).toHaveLength(0)
    expect(s.effects.wide).toBeGreaterThan(0)
    expect(s.paddle.w).toBeGreaterThan(BREAKER_LEVELS[0].paddleW)
  })

  it('lets one you dodge fall off the bottom of the field', () => {
    const s = newGame()
    s.status = 'playing'
    s.balls = [{ x: FIELD_W / 2, y: 60, vx: 0, vy: -s.speed }]
    movePaddle(s, WALL + s.paddle.w / 2)
    s.drops = [{ x: FIELD_W - WALL - 10, y: PADDLE_Y - 40, kind: 'shrink' }]

    play(s, 3)
    expect(s.drops).toHaveLength(0)
    expect(s.effects.shrink).toBeUndefined()
    expect(s.paddle.w).toBe(BREAKER_LEVELS[0].paddleW)
  })

  it('runs each ability down and hands the level back its own numbers', () => {
    const s = newGame()
    s.status = 'playing'
    s.balls = [{ x: FIELD_W / 2, y: 200, vx: 0, vy: -s.speed }]

    collect(s, 'slow')
    expect(speedOf(s)).toBeLessThan(s.speed)
    expect(Math.hypot(ball(s).vx, ball(s).vy)).toBeCloseTo(speedOf(s), 3)

    play(s, ABILITIES.slow.duration + 0.5)
    expect(s.effects.slow).toBeUndefined()
    expect(speedOf(s)).toBe(s.speed)
    if (s.status === 'playing') {
      expect(Math.hypot(ball(s).vx, ball(s).vy)).toBeCloseTo(s.speed, 3)
    }
  })

  it('cancels the opposite rather than stacking it', () => {
    const s = newGame()
    s.status = 'playing'
    collect(s, 'wide')
    const wide = s.paddle.w
    expect(wide).toBeGreaterThan(BREAKER_LEVELS[0].paddleW)

    collect(s, 'shrink')
    expect(s.effects.wide).toBeUndefined()
    expect(s.paddle.w).toBeLessThan(BREAKER_LEVELS[0].paddleW)
    expect(s.paddle.w).toBe(paddleWidthOf(s))

    collect(s, 'fast')
    expect(speedOf(s)).toBeGreaterThan(s.speed)
    collect(s, 'slow')
    expect(s.effects.fast).toBeUndefined()
    expect(speedOf(s)).toBeLessThan(s.speed)
  })

  it('splits the ball on multiball, up to a ceiling', () => {
    const s = newGame()
    launch(s, () => 0.5)
    const speed = speedOf(s)

    collect(s, 'multi')
    expect(s.balls.length).toBe(3)
    for (const b of s.balls) expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(speed, 3)

    collect(s, 'multi')
    expect(s.balls.length).toBe(MAX_BALLS)
    collect(s, 'multi')
    expect(s.balls.length).toBe(MAX_BALLS)
  })

  it('only spends a life when the last ball is gone', () => {
    const s = newGame()
    launch(s, () => 0.5)
    collect(s, 'multi')
    // Two of the three are already below the field; the third is climbing.
    s.balls[0].y = FIELD_H + 20
    s.balls[1].y = FIELD_H + 20
    s.balls[2] = { x: FIELD_W / 2, y: 200, vx: 0, vy: -s.speed }

    step(s, 1 / 60, NO_DROPS)
    expect(s.balls).toHaveLength(1)
    expect(s.lives).toBe(3)
    expect(s.status).toBe('playing')

    s.balls[0] = { x: FIELD_W / 2, y: FIELD_H, vx: 0, vy: s.speed }
    step(s, 1, NO_DROPS)
    expect(s.lives).toBe(2)
    expect(s.status).toBe('ready')
  })

  it('hands back a clean field after a life is lost', () => {
    const s = newGame()
    launch(s, () => 0.5)
    collect(s, 'wide')
    collect(s, 'laser')
    fire(s)
    s.drops = [{ x: 40, y: 100, kind: 'multi' }]

    s.balls = [{ x: FIELD_W / 2, y: FIELD_H, vx: 0, vy: s.speed }]
    step(s, 1, NO_DROPS)
    expect(s.status).toBe('ready')
    expect(s.effects).toEqual({})
    expect(s.drops).toEqual([])
    expect(s.bolts).toEqual([])
    expect(s.paddle.w).toBe(BREAKER_LEVELS[0].paddleW)
    expect(s.balls).toHaveLength(1)
  })

  it('adds a life, but not past the ceiling', () => {
    const s = newGame()
    collect(s, 'life')
    expect(s.lives).toBe(4)
    for (let i = 0; i < 5; i++) collect(s, 'life')
    expect(s.lives).toBe(MAX_LIVES)
  })

  it('fires only when armed, and only as fast as it reloads', () => {
    const s = newGame()
    launch(s, () => 0.5)
    expect(fire(s)).toBe(false)
    expect(s.bolts).toHaveLength(0)

    collect(s, 'laser')
    expect(fire(s)).toBe(true)
    expect(s.bolts).toHaveLength(2)
    expect(fire(s)).toBe(false) // still reloading

    play(s, 0.4)
    expect(fire(s)).toBe(true)
  })

  it('breaks bricks with bolts, and loses them to steel and to the ceiling', () => {
    const s = newGame(BREAKER_LEVELS.length - 1)
    const steel = s.bricks.find((b) => b.solid)!
    const soft = s.bricks.find((b) => !b.solid)!
    soft.hp = 1
    s.bricks = [steel, soft]
    s.status = 'playing'
    s.balls = [{ x: FIELD_W / 2, y: 300, vx: 0, vy: -s.speed }]

    s.bolts = [{ x: soft.x + soft.w / 2, y: soft.y + soft.h + 20 }]
    play(s, 0.4)
    expect(s.bolts).toHaveLength(0)
    expect(s.bricks).toEqual([steel])

    s.status = 'playing'
    s.bolts = [{ x: steel.x + steel.w / 2, y: steel.y + steel.h + 20 }]
    play(s, 0.4)
    expect(s.bolts).toHaveLength(0)
    expect(s.bricks[0].hp).toBe(1)

    s.bricks = []
    s.status = 'playing'
    s.bolts = [{ x: FIELD_W / 2, y: 20 }]
    play(s, 0.4)
    expect(s.bolts).toHaveLength(0)
  })

  it('does not tunnel a bolt through a brick', () => {
    const s = newGame()
    s.status = 'playing'
    s.balls = [{ x: FIELD_W / 2, y: 300, vx: 0, vy: -s.speed }]
    const target = s.bricks[0]
    target.hp = 1
    s.bricks = [target]
    // One frame is a bigger hop than a brick is tall — the substepping is
    // what stops the bolt going straight past it.
    s.bolts = [{ x: target.x + target.w / 2, y: target.y + target.h + 4 }]
    step(s, 1 / 30, NO_DROPS)
    expect(s.bricks).toHaveLength(0)
  })

  it('gives every ability a glyph, a name and a chance of turning up', () => {
    for (const kind of ABILITY_KINDS) {
      const a = ABILITIES[kind]
      expect(a.kind).toBe(kind)
      expect(a.glyph).toHaveLength(1)
      expect(a.name.length).toBeGreaterThan(2)
      expect(a.weight).toBeGreaterThan(0)
      expect(a.duration).toBeGreaterThanOrEqual(0)
    }
    // Catching one is worth points, and the timed ones outlast a rally but
    // not the rest they were dropped in.
    for (const kind of ABILITY_KINDS) {
      expect(ABILITIES[kind].duration).toBeLessThanOrEqual(15)
    }
  })

  it('catches a capsule with the paddle it actually has, not the one the level gave it', () => {
    /** A game on the narrowest level, with the ball safely climbing. */
    const rig = (widen: boolean) => {
      const s = newGame(BREAKER_LEVELS.length - 1)
      s.status = 'playing'
      s.balls = [{ x: FIELD_W / 2, y: 200, vx: 0, vy: -s.speed }]
      movePaddle(s, FIELD_W / 2)
      if (widen) collect(s, 'wide')
      return s
    }
    /** How far off centre a capsule can be and still be caught. */
    const reach = (s: BreakerState) => s.paddle.w / 2 + DROP_W / 2

    const narrow = rig(false)
    const wide = rig(true)
    // Aimed to land between the two reaches: a miss for one, a catch for the
    // other, off the same spot on the field.
    const x = FIELD_W / 2 + (reach(narrow) + reach(wide)) / 2
    expect(x).toBeGreaterThan(FIELD_W / 2 + reach(narrow))
    expect(x).toBeLessThan(FIELD_W / 2 + reach(wide))

    for (const s of [narrow, wide]) s.drops = [{ x, y: PADDLE_Y - 60, kind: 'slow' }]
    play(narrow, 2)
    play(wide, 2)
    expect(narrow.effects.slow).toBeUndefined()
    expect(wide.effects.slow).toBeGreaterThan(0)
  })

  it('never lets an ability push the paddle out of the gutters', () => {
    const s = newGame()
    s.status = 'playing'
    movePaddle(s, 9999)
    collect(s, 'wide')
    expect(s.paddle.x + s.paddle.w / 2).toBeLessThanOrEqual(FIELD_W - WALL + 0.001)
    expect(s.paddle.x - s.paddle.w / 2).toBeGreaterThanOrEqual(WALL - 0.001)
    expect(PADDLE_Y + PADDLE_H).toBeLessThan(FIELD_H)
  })
})
