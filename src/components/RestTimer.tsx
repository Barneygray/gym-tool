import { useEffect, useRef, useState } from 'react'
import { notifyRestDone } from '../notify'

interface RestTimerProps {
  /** Unix ms when the rest period started; changes retrigger the timer. */
  startedAt: number
  durationSec: number
  soundOn: boolean
  onDismiss: () => void
}

export function RestTimer({ startedAt, durationSec, soundOn, onDismiss }: RestTimerProps) {
  const [now, setNow] = useState(Date.now())
  const beeped = useRef(false)

  useEffect(() => {
    beeped.current = false
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [startedAt])

  const elapsed = (now - startedAt) / 1000
  const remaining = Math.max(0, durationSec - elapsed)
  const done = remaining <= 0

  useEffect(() => {
    if (done && !beeped.current) {
      beeped.current = true
      if (soundOn) beep()
      if (navigator.vibrate) navigator.vibrate([180, 90, 180])
      void notifyRestDone()
    }
  }, [done, soundOn])

  const frac = Math.min(1, elapsed / durationSec)
  const R = 16
  const C = 2 * Math.PI * R

  const mm = Math.floor(remaining / 60)
  const ss = Math.floor(remaining % 60)

  return (
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
      <div>
        <div className="time num">{done ? 'GO' : `${mm}:${String(ss).padStart(2, '0')}`}</div>
        <div className="sub">{done ? 'Rested — next set' : 'Resting'}</div>
      </div>
      <div className="actions">
        <button className="btn-small" onClick={onDismiss}>{done ? 'OK' : 'Skip'}</button>
      </div>
    </div>
  )
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const play = (freq: number, at: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.28)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + at)
      osc.stop(ctx.currentTime + at + 0.3)
    }
    play(880, 0)
    play(1174, 0.32)
    setTimeout(() => ctx.close(), 1200)
  } catch {
    // audio unavailable — vibration already covers it
  }
}
