import { describe, it, expect } from 'vitest'
import {
  BALL_R, BREAKER_LEVELS, FIELD_H, FIELD_W, PADDLE_Y, WALL,
  buildBricks, launch, movePaddle, newGame, step, type BreakerState,
} from './breaker'

/** Run the game forward at a steady 60fps for `seconds`. */
function play(s: BreakerState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) step(s, 1 / 60)
}

describe('brick breaker levels', () => {
  it('has a few of them, each with bricks laid out on a rectangular grid', () => {
    expect(BREAKER_LEVELS.length).toBeGreaterThanOrEqual(3)
    for (const level of BREAKER_LEVELS) {
      expect(level.rows.length).toBeGreaterThan(0)
      const cols = level.rows[0].length
      for (const row of level.rows) {
        expect(row.length).toBe(cols)
        expect(row).toMatch(/^[.1-3]+$/)
      }
      expect(buildBricks(level).length).toBeGreaterThan(0)
    }
  })

  it('gets harder as it goes — faster ball, narrower paddle', () => {
    for (let i = 1; i < BREAKER_LEVELS.length; i++) {
      expect(BREAKER_LEVELS[i].speed).toBeGreaterThan(BREAKER_LEVELS[i - 1].speed)
      expect(BREAKER_LEVELS[i].paddleW).toBeLessThan(BREAKER_LEVELS[i - 1].paddleW)
    }
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
    for (const level of BREAKER_LEVELS) {
      const hits = buildBricks(level).reduce((n, b) => n + b.hp, 0)
      expect(hits).toBeLessThanOrEqual(30)
    }
  })
})

describe('brick breaker play', () => {
  it('parks the ball on the paddle until it is launched', () => {
    const s = newGame()
    expect(s.status).toBe('ready')
    movePaddle(s, 100)
    play(s, 1)
    expect(s.ball.x).toBe(100)
    expect(s.ball.y).toBeLessThan(PADDLE_Y)
    expect(s.ball.vy).toBe(0)

    launch(s, () => 0.5)
    expect(s.status).toBe('playing')
    expect(s.ball.vy).toBeLessThan(0)
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
      step(s, 1 / 60)
      // Track the ball so it never drops, and watch the box the whole time.
      movePaddle(s, s.ball.x)
      expect(s.ball.x).toBeGreaterThanOrEqual(WALL - 0.001)
      expect(s.ball.x).toBeLessThanOrEqual(FIELD_W - WALL + 0.001)
      expect(s.ball.y).toBeGreaterThanOrEqual(-0.001)
      if (s.status !== 'playing') break
    }
  })

  it('does not tunnel through bricks at the fastest level speed', () => {
    const s = newGame(BREAKER_LEVELS.length - 1)
    const total = s.bricks.length
    launch(s, () => 0.5)
    for (let i = 0; i < 60 * 20 && s.status === 'playing'; i++) {
      step(s, 1 / 60)
      movePaddle(s, s.ball.x)
    }
    expect(s.bricks.length).toBeLessThan(total)
  })

  it('bounces off the paddle, and off its edges at an angle', () => {
    const s = newGame()
    movePaddle(s, FIELD_W / 2)
    launch(s, () => 0.5)
    s.ball.x = s.paddle.x + s.paddle.w / 2 - 1
    s.ball.y = PADDLE_Y - BALL_R - 1
    s.ball.vx = 0
    s.ball.vy = s.speed
    step(s, 1 / 60)
    expect(s.ball.vy).toBeLessThan(0)
    expect(s.ball.vx).toBeGreaterThan(0)
  })

  it('spends a life when the ball drops, and ends the run at zero', () => {
    const s = newGame()
    const drop = () => {
      s.status = 'playing'
      s.ball.x = FIELD_W / 2
      s.ball.y = FIELD_H
      s.ball.vx = 0
      s.ball.vy = s.speed
      step(s, 1)
    }
    drop()
    expect(s.lives).toBe(2)
    expect(s.status).toBe('ready')
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
    s.ball.x = s.bricks[0].x + s.bricks[0].w / 2
    s.ball.y = s.bricks[0].y + s.bricks[0].h + BALL_R - 0.5
    s.ball.vx = 0
    s.ball.vy = -s.speed
    step(s, 1 / 60)
    expect(s.bricks).toHaveLength(0)
    expect(s.status).toBe('level-clear')
    expect(s.score).toBeGreaterThan(0)

    const last = newGame(BREAKER_LEVELS.length - 1, { lives: 1, score: 500 })
    last.bricks = []
    last.status = 'playing'
    last.bricks = [{ x: FIELD_W / 2 - 10, y: 100, w: 20, h: 14, hp: 1, maxHp: 1 }]
    last.ball = { x: FIELD_W / 2, y: 100 + 14 + BALL_R - 0.5, vx: 0, vy: -last.speed }
    step(last, 1 / 60)
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
    const before = { ...s.ball }
    play(s, 2)
    expect(s.ball).toEqual(before)
  })
})
