import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BALL_R, BREAKER_LEVELS, FIELD_H, FIELD_W, PADDLE_H, PADDLE_Y, WALL,
  launch, movePaddle, newGame, step, type BreakerState,
} from '../engine/breaker'
import { CloseIcon } from './Icons'
import { Overlay } from './Overlay'

interface BrickBreakerProps {
  /** Seconds left on the rest clock — the game never hides the reason you're here. */
  remainingSec: number
  onClose: () => void
}

/** What the header and the overlay need. Redrawn only when one of them moves. */
interface Hud {
  levelIndex: number
  status: BreakerState['status']
  lives: number
  score: number
}

/**
 * The rest-timer's brick breaker: a canvas the size of the modal, a paddle that
 * follows your thumb, and five levels. The clock stays in the header and the
 * whole thing is torn down the moment rest is over — this is somewhere to put
 * ninety seconds, not somewhere to be when the next set starts.
 */
export function BrickBreaker({ remainingSec, onClose }: BrickBreakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const game = useRef<BreakerState>(newGame())
  const [hud, setHud] = useState<Hud>(snapshot(game.current))

  // The paddle is dragged, so the canvas must not also scroll or select; and a
  // tap anywhere on it serves the launch as well as the aim.
  const aim = useCallback((clientX: number) => {
    const el = canvasRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    movePaddle(game.current, ((clientX - r.left) / r.width) * FIELD_W)
  }, [])

  /** Whatever the overlay's button says: launch, retry, or take the next level. */
  const advance = useCallback(() => {
    const s = game.current
    if (s.status === 'ready') launch(s)
    else if (s.status === 'level-clear') game.current = newGame(s.levelIndex + 1, { lives: s.lives, score: s.score })
    else if (s.status === 'over' || s.status === 'complete') game.current = newGame(0)
    setHud(snapshot(game.current))
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    const colors = themeColors(el)

    // Back the canvas at device resolution for the size it's actually drawn
    // at — a 320-unit field blown up to 300 CSS pixels is a blurry field.
    let scale = 1
    const resize = () => {
      const w = el.clientWidth || FIELD_W
      scale = (w / FIELD_W) * (window.devicePixelRatio || 1)
      el.width = Math.round(FIELD_W * scale)
      el.height = Math.round(FIELD_H * scale)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let raf = 0
    let last = performance.now()
    let shown = snapshot(game.current)
    const frame = (t: number) => {
      // Clamp the delta: come back from a locked phone and the elapsed time
      // is a minute, which would teleport the ball through the floor.
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      step(game.current, dt)
      const now = snapshot(game.current)
      if (!sameHud(now, shown)) {
        shown = now
        setHud(now)
      }
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      draw(ctx, game.current, colors)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = game.current
      if (e.key === 'Escape') return onClose()
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        return advance()
      }
      const nudge = e.key === 'ArrowLeft' ? -18 : e.key === 'ArrowRight' ? 18 : 0
      if (nudge) {
        e.preventDefault()
        movePaddle(s, s.paddle.x + nudge)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, onClose])

  const level = BREAKER_LEVELS[Math.min(hud.levelIndex, BREAKER_LEVELS.length - 1)]
  const mm = Math.floor(Math.max(0, remainingSec) / 60)
  const ss = Math.floor(Math.max(0, remainingSec) % 60)
  const overlay = overlayFor(hud)

  return (
    <Overlay>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="bb-modal" role="dialog" aria-modal="true" aria-label="Brick breaker">
        <div className="bb-head">
          <div className="bb-id">
            <div className="bb-level">{level.name}</div>
            <div className="bb-meta num">
              LVL {hud.levelIndex + 1}/{BREAKER_LEVELS.length} · {hud.score}
            </div>
          </div>
          <div className="bb-lives" aria-label={`${hud.lives} lives left`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`bb-life${i < hud.lives ? ' on' : ''}`} />
            ))}
          </div>
          <div className="bb-clock num">{mm}:{String(ss).padStart(2, '0')}</div>
          <button className="icon-btn bb-close" onClick={onClose} aria-label="Close game">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="bb-stage">
          <canvas
            ref={canvasRef}
            className="bb-canvas"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              aim(e.clientX)
              advance()
            }}
            onPointerMove={(e) => aim(e.clientX)}
          />
          {/* Pointer-transparent, so you can still aim through it before you
              serve — only the button itself takes a tap. */}
          {overlay && (
            <div className="bb-overlay">
              <div className="bb-over-title">{overlay.title}</div>
              <div className="bb-over-sub">{overlay.sub}</div>
              <button className="btn-small accent" onClick={advance}>{overlay.action}</button>
            </div>
          )}
        </div>

        <div className="bb-foot">Drag to move · rest keeps counting</div>
      </div>
    </Overlay>
  )
}

function snapshot(s: BreakerState): Hud {
  return { levelIndex: s.levelIndex, status: s.status, lives: s.lives, score: s.score }
}

function sameHud(a: Hud, b: Hud): boolean {
  return a.levelIndex === b.levelIndex && a.status === b.status && a.lives === b.lives && a.score === b.score
}

/** The card over the field between balls. Nothing to say while it's live. */
function overlayFor(hud: Hud): { title: string; sub: string; action: string } | null {
  switch (hud.status) {
    case 'playing':
      return null
    case 'ready':
      return hud.lives === 3
        ? { title: 'Brick breaker', sub: 'Drag to aim, tap to serve', action: 'Serve' }
        : { title: 'Ball down', sub: `${hud.lives} ${hud.lives === 1 ? 'life' : 'lives'} left`, action: 'Serve' }
    case 'level-clear':
      return { title: 'Level clear', sub: `${hud.score} points — next one's faster`, action: 'Next level' }
    case 'over':
      return { title: 'Game over', sub: `${hud.score} points`, action: 'Again' }
    case 'complete':
      return { title: 'All levels clear', sub: `${hud.score} points. Go and lift something.`, action: 'Again' }
  }
}

interface Colors {
  bg: string
  line: string
  ball: string
  paddle: string
  brick1: string
  brick1Line: string
  brick2: string
  brick2Line: string
  brick3: string
}

/** Borrow the app's own palette rather than inventing a game one. */
function themeColors(el: HTMLElement): Colors {
  const cs = getComputedStyle(el)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    bg: v('--bg', '#0a0908'),
    line: v('--line', 'rgba(255,246,240,0.09)'),
    ball: v('--text', '#f5f2ef'),
    paddle: v('--ember', '#ff6b38'),
    brick1: v('--surface-3', '#24211f'),
    brick1Line: v('--line-strong', 'rgba(255,246,240,0.24)'),
    brick2: v('--ember-soft', 'rgba(255,107,56,0.1)'),
    brick2Line: v('--ember-line', 'rgba(255,107,56,0.34)'),
    brick3: v('--ember', '#ff6b38'),
  }
}

function draw(ctx: CanvasRenderingContext2D, s: BreakerState, c: Colors): void {
  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, FIELD_W, FIELD_H)

  // The gutters, marked — the field has edges and they should be visible.
  ctx.strokeStyle = c.line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(WALL - 0.5, 0)
  ctx.lineTo(WALL - 0.5, FIELD_H)
  ctx.moveTo(FIELD_W - WALL + 0.5, 0)
  ctx.lineTo(FIELD_W - WALL + 0.5, FIELD_H)
  ctx.stroke()

  for (const b of s.bricks) {
    const solid = b.hp >= 3
    ctx.fillStyle = b.hp >= 3 ? c.brick3 : b.hp === 2 ? c.brick2 : c.brick1
    rect(ctx, b.x, b.y, b.w, b.h, 2)
    ctx.fill()
    if (!solid) {
      ctx.strokeStyle = b.hp === 2 ? c.brick2Line : c.brick1Line
      ctx.lineWidth = 1
      rect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 2)
      ctx.stroke()
    }
  }

  ctx.fillStyle = c.paddle
  rect(ctx, s.paddle.x - s.paddle.w / 2, PADDLE_Y, s.paddle.w, PADDLE_H, PADDLE_H / 2)
  ctx.fill()

  ctx.fillStyle = c.ball
  ctx.beginPath()
  ctx.arc(s.ball.x, s.ball.y, BALL_R, 0, Math.PI * 2)
  ctx.fill()
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
}
