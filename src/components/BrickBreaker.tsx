import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ABILITIES, BALL_R, BOLT_H, BOLT_W, BREAKER_LEVELS, DROP_H, DROP_W,
  FIELD_H, FIELD_W, LIVES, MAX_LIVES, PADDLE_H, PADDLE_Y, WALL,
  fire, launch, levelOf, movePaddle, newGame, step,
  type AbilityKind, type BreakerState,
} from '../engine/breaker'
import { loadMemory, nextRun, saveMemory } from '../engine/breakerMemory'
import { CloseIcon } from './Icons'
import { Overlay } from './Overlay'

interface BrickBreakerProps {
  /** Seconds left on the rest clock — the game never hides the reason you're here. */
  remainingSec: number
  /**
   * The workout this rest belongs to. The run is remembered across the whole of
   * it, so closing the game between sets is a pause, not a forfeit.
   */
  sessionKey: string
  onClose: () => void
}

/** What the header and the overlay need. Redrawn only when one of them moves. */
interface Hud {
  levelIndex: number
  status: BreakerState['status']
  lives: number
  score: number
  /** Whether the parked ball is one just dropped, rather than one not yet served. */
  dropped: boolean
  /** Abilities running, with whole seconds left — the chips under the field. */
  fx: { kind: AbilityKind; left: number }[]
}

/**
 * The rest-timer's brick breaker: a canvas the size of the modal, a paddle that
 * follows your thumb, and ten levels. The clock stays in the header and the
 * whole thing is torn down the moment rest is over — this is somewhere to put
 * ninety seconds, not somewhere to be when the next set starts.
 *
 * Torn down, but not forgotten: the run is stored against the session, so the
 * next rest opens on the level you were on with the bricks you'd already
 * broken. Ten levels is far more than ninety seconds' worth; an hour of rests
 * is about right.
 *
 * Broken bricks drop abilities, and they fall — catching one means leaving the
 * ball to look after itself for a second, which is the trade. From the fourth
 * level on, some of what falls is worth dodging.
 */
export function BrickBreaker({ remainingSec, sessionKey, onClose }: BrickBreakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Read once, at the top of the rest: whatever this session had going.
  const [carried] = useState(() => loadMemory(sessionKey))
  const game = useRef<BreakerState>(carried.state)
  /** What survives a run ending — the current game's score is in `game`. */
  const tally = useRef({ best: carried.best, runs: carried.runs })
  const [hud, setHud] = useState<Hud>(snapshot(game.current))
  /** Cleared on the first serve: it only labels the overlay you came back to. */
  const [returning, setReturning] = useState(carried.carried)

  const persist = useCallback(() => {
    saveMemory(sessionKey, { state: game.current, ...tally.current })
  }, [sessionKey])

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
    if (s.status === 'ready') {
      launch(s)
      setReturning(false)
    } else if (s.status === 'level-clear') {
      game.current = newGame(s.levelIndex + 1, { lives: s.lives, score: s.score })
    } else if (s.status === 'over' || s.status === 'complete') {
      // The run is over, the session isn't: its score goes on the board before
      // the next one starts back at zero.
      const next = nextRun({ state: s, ...tally.current, carried: false })
      tally.current = { best: next.best, runs: next.runs }
      game.current = next.state
    }
    setHud(snapshot(game.current))
    persist()
  }, [persist])

  /**
   * A tap mid-rally means something once you're holding lasers, so they get
   * first refusal on it. Everything else is the overlay's button.
   */
  const tap = useCallback(() => {
    if (fire(game.current)) {
      setHud(snapshot(game.current))
      return
    }
    advance()
  }, [advance])

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
        // Every brick moves the score, so this is also the save point: the run
        // is never more than one hit behind whatever storage holds.
        persist()
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
  }, [persist])

  // Closing the game is the ordinary way to leave it, but a locked phone or a
  // killed tab is just as common mid-session — write the run on the way out of
  // all three.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && persist()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', persist)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', persist)
      persist()
    }
  }, [persist])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = game.current
      if (e.key === 'Escape') return onClose()
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        return tap()
      }
      const nudge = e.key === 'ArrowLeft' ? -18 : e.key === 'ArrowRight' ? 18 : 0
      if (nudge) {
        e.preventDefault()
        movePaddle(s, s.paddle.x + nudge)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, tap])

  const level = levelOf(hud)
  const mm = Math.floor(Math.max(0, remainingSec) / 60)
  const ss = Math.floor(Math.max(0, remainingSec) % 60)
  /** The session's high score, which the run in progress can already be. */
  const best = Math.max(tally.current.best, hud.score)
  const overlay = overlayFor(hud, { best, returning })
  const lifeSlots = Math.max(LIVES, Math.min(hud.lives, MAX_LIVES))

  return (
    <Overlay>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="bb-modal" role="dialog" aria-modal="true" aria-label="Brick breaker">
        <div className="bb-head">
          <div className="bb-id">
            <div className="bb-level">{level.name}</div>
            <div className="bb-meta num">
              LVL {hud.levelIndex + 1}/{BREAKER_LEVELS.length} · {hud.score}
              {best > hud.score && ` · BEST ${best}`}
            </div>
          </div>
          <div className="bb-lives" aria-label={`${hud.lives} lives left`}>
            {Array.from({ length: lifeSlots }, (_, i) => (
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
              tap()
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

        {/* The footer is the hint until something's running, then it's the
            readout — there's nowhere else on a phone-sized modal to put it. */}
        {hud.fx.length > 0 ? (
          <div className="bb-fx" aria-label="Abilities running">
            {hud.fx.map((f) => (
              <span key={f.kind} className={`bb-chip${ABILITIES[f.kind].good ? '' : ' bad'}`}>
                {ABILITIES[f.kind].name} <b className="num">{f.left}s</b>
              </span>
            ))}
          </div>
        ) : (
          <div className="bb-foot">
            {footHint(hud.levelIndex)}
          </div>
        )}
      </div>
    </Overlay>
  )
}

function snapshot(s: BreakerState): Hud {
  return {
    levelIndex: s.levelIndex,
    status: s.status,
    lives: s.lives,
    score: s.score,
    dropped: s.dropped,
    fx: (Object.keys(s.effects) as AbilityKind[])
      .map((kind) => ({ kind, left: Math.ceil(s.effects[kind] ?? 0) }))
      .sort((a, b) => a.kind.localeCompare(b.kind)),
  }
}

/** Whole-second resolution, so a running ability redraws once a second. */
const fxKey = (fx: Hud['fx']): string => fx.map((f) => `${f.kind}${f.left}`).join(',')

function sameHud(a: Hud, b: Hud): boolean {
  return a.levelIndex === b.levelIndex && a.status === b.status && a.lives === b.lives
    && a.score === b.score && a.dropped === b.dropped && fxKey(a.fx) === fxKey(b.fx)
}

/** The line under the field, which changes once the level can turn on you. */
function footHint(levelIndex: number): string {
  return levelOf({ levelIndex }).hazards
    ? 'Drag to move · catch the orange, dodge the red'
    : 'Drag to move · catch what drops'
}

/** What the session remembers, for the lines that mention it. */
interface Memory {
  best: number
  /** This rest opened onto a run that was already going. */
  returning: boolean
}

/** The card over the field between balls. Nothing to say while it's live. */
function overlayFor(hud: Hud, mem: Memory): { title: string; sub: string; action: string } | null {
  const beat = mem.best > hud.score ? ` · best ${mem.best}` : ''
  switch (hud.status) {
    case 'playing':
      return null
    case 'ready':
      // Three different things a parked ball can mean: a fresh session, the set
      // you came back to, and the one you just dropped.
      if (mem.returning) {
        const lives = `${hud.lives} ${hud.lives === 1 ? 'life' : 'lives'}`
        return {
          title: 'Where you left it',
          sub: `Level ${hud.levelIndex + 1} · ${hud.score} points · ${lives}`,
          action: 'Serve',
        }
      }
      // Lives can't tell these apart — an extra life means a run can be back
      // down to three having lost one — so the run says which it is.
      return hud.dropped
        ? { title: 'Ball down', sub: `${hud.lives} ${hud.lives === 1 ? 'life' : 'lives'} left`, action: 'Serve' }
        : { title: 'Brick breaker', sub: 'Drag to aim, tap to serve', action: 'Serve' }
    case 'level-clear':
      return { title: 'Level clear', sub: nextUp(hud.levelIndex + 1, hud.score), action: 'Next level' }
    case 'over':
      return { title: 'Game over', sub: `${hud.score} points${beat}`, action: 'Again' }
    case 'complete':
      return { title: 'All ten clear', sub: `${hud.score} points. Go and lift something.`, action: 'Again' }
  }
}

/** Name the level you're walking into — by the sixth one that's a warning. */
function nextUp(levelIndex: number, score: number): string {
  return `${score} points — next up, ${levelOf({ levelIndex }).name.toLowerCase()}`
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
  brick4: string
  steel: string
  steelLine: string
  good: string
  bad: string
  ink: string
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
    brick3: v('--ember-deep', '#c9410f'),
    brick4: v('--ember', '#ff6b38'),
    steel: v('--text-faint', '#6e6660'),
    steelLine: v('--surface-2', '#1a1817'),
    good: v('--ember-hi', '#ff9166'),
    bad: v('--bad', '#ef4f52'),
    ink: v('--ember-ink', '#180701'),
  }
}

/** Capsule and paddle-nub lettering. One face, small, and never re-measured. */
const GLYPH_FONT = '700 7px Archivo, -apple-system, system-ui, sans-serif'

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
    // Steel reads as metal: grey, and with a seam down it so it never gets
    // mistaken for a brick that's nearly gone.
    if (b.solid) {
      ctx.fillStyle = c.steel
      rect(ctx, b.x, b.y, b.w, b.h, 2)
      ctx.fill()
      ctx.strokeStyle = c.steelLine
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(b.x + 3, b.y + b.h / 2)
      ctx.lineTo(b.x + b.w - 3, b.y + b.h / 2)
      ctx.stroke()
      continue
    }
    const outlined = b.hp <= 2
    ctx.fillStyle = b.hp >= 4 ? c.brick4 : b.hp === 3 ? c.brick3 : b.hp === 2 ? c.brick2 : c.brick1
    rect(ctx, b.x, b.y, b.w, b.h, 2)
    ctx.fill()
    if (outlined) {
      ctx.strokeStyle = b.hp === 2 ? c.brick2Line : c.brick1Line
      ctx.lineWidth = 1
      rect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 2)
      ctx.stroke()
    }
  }

  // Bolts first, so a capsule falling past one is drawn over it.
  ctx.fillStyle = c.good
  for (const bolt of s.bolts) ctx.fillRect(bolt.x - BOLT_W / 2, bolt.y, BOLT_W, BOLT_H)

  ctx.font = GLYPH_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const d of s.drops) {
    const a = ABILITIES[d.kind]
    ctx.fillStyle = a.good ? c.good : c.bad
    rect(ctx, d.x - DROP_W / 2, d.y - DROP_H / 2, DROP_W, DROP_H, DROP_H / 2)
    ctx.fill()
    ctx.fillStyle = a.good ? c.ink : c.bg
    ctx.fillText(a.glyph, d.x, d.y + 0.5)
  }

  ctx.fillStyle = c.paddle
  rect(ctx, s.paddle.x - s.paddle.w / 2, PADDLE_Y, s.paddle.w, PADDLE_H, PADDLE_H / 2)
  ctx.fill()
  // Armed: two muzzles on the ends, so the paddle looks like what it now does.
  if (s.effects.laser) {
    const off = Math.min(s.paddle.w / 2 - 2, 14)
    ctx.fillStyle = c.good
    for (const x of [s.paddle.x - off, s.paddle.x + off]) {
      ctx.fillRect(x - BOLT_W / 2, PADDLE_Y - 3, BOLT_W, 3)
    }
  }

  ctx.fillStyle = c.ball
  for (const b of s.balls) {
    ctx.beginPath()
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
    ctx.fill()
  }
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
}
