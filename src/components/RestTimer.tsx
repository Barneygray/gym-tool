import { useEffect, useRef, useState } from 'react'
import { cancelRestAlert, notifyRestDone, scheduleRestAlert } from '../notify'
import { beep } from './chime'
import { BrickBreaker } from './BrickBreaker'
import { Overlay } from './Overlay'

interface RestTimerProps {
  /** Unix ms when the rest period started; changes retrigger the timer. */
  startedAt: number
  durationSec: number
  soundOn: boolean
  onDismiss: () => void
  /** When set, a superset partner to jump straight to instead of waiting. */
  partner?: { label: string; onGo: () => void }
  /** Name of the station the rest came from, once you've moved on from it. */
  fromLabel?: string
}

export function RestTimer({ startedAt, durationSec, soundOn, onDismiss, partner, fromLabel }: RestTimerProps) {
  const [now, setNow] = useState(Date.now())
  const [playing, setPlaying] = useState(false)
  const beeped = useRef(false)

  useEffect(() => {
    beeped.current = false
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [startedAt])

  const elapsed = (now - startedAt) / 1000
  const remaining = Math.max(0, durationSec - elapsed)
  const done = remaining <= 0
  const endsAt = startedAt + durationSec * 1000

  // Lock the phone or switch apps and the interval above stops running, so this
  // component can't be the thing that alerts you — it isn't awake to. Hand the
  // deadline to the service worker for the whole rest, and add the
  // timestamp-triggered alert (where supported) the moment we actually go off
  // screen. Coming back cancels both: you're here, the timer speaks for itself.
  useEffect(() => {
    void scheduleRestAlert(endsAt, document.visibilityState === 'hidden')
    const onLeave = () => {
      if (document.visibilityState === 'hidden') void scheduleRestAlert(endsAt, true)
      else void cancelRestAlert()
    }
    document.addEventListener('visibilitychange', onLeave)
    window.addEventListener('pagehide', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onLeave)
      window.removeEventListener('pagehide', onLeave)
      void cancelRestAlert()
    }
  }, [endsAt])

  useEffect(() => {
    if (done && !beeped.current) {
      beeped.current = true
      if (soundOn) beep()
      if (navigator.vibrate) navigator.vibrate([180, 90, 180])
      void notifyRestDone()
    }
  }, [done, soundOn])

  // The game is a way to spend the rest, so it ends with the rest — no
  // deciding between the next set and one more level.
  useEffect(() => {
    if (done) setPlaying(false)
  }, [done])

  const frac = Math.min(1, elapsed / durationSec)
  const R = 16
  const C = 2 * Math.PI * R

  const mm = Math.floor(remaining / 60)
  const ss = Math.floor(remaining % 60)

  return (
    <>
      {playing && !done && (
        <BrickBreaker remainingSec={remaining} onClose={() => setPlaying(false)} />
      )}
      <Overlay>
        <div className={`rest-timer${done ? ' done' : ''}`}>
          <svg className="ring" width="40" height="40" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r={R} stroke="var(--line-strong)" strokeWidth="3.5" fill="none" />
            <circle
              cx="20" cy="20" r={R}
              stroke={done ? 'var(--green)' : 'var(--ember)'}
              strokeWidth="3.5" fill="none" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
              transform="rotate(-90 20 20)"
              style={{ transition: 'stroke-dashoffset 0.25s linear' }}
            />
          </svg>
          <div className="rt-body">
            <div className="time num">{done ? 'GO' : `${mm}:${String(ss).padStart(2, '0')}`}</div>
            <div className="sub">{subLabel(done, partner?.label, fromLabel)}</div>
          </div>
          <div className="actions">
            {partner && (
              <button className="btn-small accent" onClick={partner.onGo}>{partner.label}</button>
            )}
            {/* Before Skip, so the dismiss button keeps the same corner whether
                or not there's a game to open. */}
            {!done && (
              <button className="btn-small tight" onClick={() => setPlaying(true)}>Brick Breaker</button>
            )}
            <button className="btn-small" onClick={onDismiss}>{done ? 'OK' : 'Skip'}</button>
          </div>
        </div>
      </Overlay>
    </>
  )
}

/**
 * The line under the clock. It answers whichever question is live: what to do
 * next in a superset, what the clock belongs to once you've walked to another
 * station, and otherwise just where the rest is up to.
 */
function subLabel(done: boolean, partnerLabel?: string, fromLabel?: string): string {
  if (partnerLabel) return `Superset — then ${partnerLabel}`
  if (fromLabel) return `${done ? 'Rested' : 'Resting'} — ${fromLabel}`
  return done ? 'Rested — next set' : 'Resting'
}
