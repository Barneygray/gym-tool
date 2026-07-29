import { useMemo, useState } from 'react'
import type { Muscle, Session } from '../types'
import {
  COOLDOWN_MINUTES, COOLDOWN_TRACKS, buildCooldown, formatDuration, trackName,
  type CooldownPlan, type CooldownTrack,
} from '../engine/cooldown'
import { BackIcon, ChevronIcon } from './Icons'
import { Overlay } from './Overlay'

interface CooldownSheetProps {
  /** Muscles the finished session trained — what a warm down is built around. */
  muscles: Muscle[]
  history: Session[]
  onStart: (plan: CooldownPlan) => void
  onSkip: () => void
}

/**
 * The two questions worth asking while someone is still standing in the gym:
 * what kind of finish, and how long. Both are one tap, and the answer is a block
 * built from the app's own stretch and conditioning catalogs — not a fourth
 * thing to go and find in another tab.
 */
export function CooldownSheet({ muscles, history, onStart, onSkip }: CooldownSheetProps) {
  const [track, setTrack] = useState<CooldownTrack | null>(null)
  const now = Date.now()

  // Both lengths are costed up front, so each button can say what it actually
  // holds rather than promising a number of minutes and improvising after.
  const plans = useMemo(() => {
    if (!track) return null
    return COOLDOWN_MINUTES.map((minutes) =>
      buildCooldown(track, minutes, { muscles, history, now }),
    )
    // `now` is read once per sheet; re-costing on every tick would be noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, muscles, history])

  return (
    <Overlay>
      <div className="sheet-backdrop" onClick={onSkip} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="cooldown-title">
        {track === null ? (
          <>
            <h2 className="sheet-title" id="cooldown-title">Finish it properly</h2>
            <p className="sheet-sub">
              You're warm and the hard part is done — five minutes now is the cheapest it
              will ever be.
            </p>

            <div className="cool-options">
              {COOLDOWN_TRACKS.map((t) => (
                <button className="cool-option" key={t.id} onClick={() => setTrack(t.id)}>
                  <div>
                    <div className="co-name">{t.name}</div>
                    <div className="co-blurb">{t.blurb}</div>
                  </div>
                  <span className="chev"><ChevronIcon size={16} /></span>
                </button>
              ))}
            </div>

            <button className="btn-ghost mt-3" onClick={onSkip}>Skip</button>
          </>
        ) : (
          <>
            <div className="sheet-head">
              <button className="icon-btn" aria-label="Back to cool-down options"
                onClick={() => setTrack(null)}>
                <BackIcon size={20} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="sheet-title" id="cooldown-title">{trackName(track)}</h2>
                <p className="sheet-sub">How long have you got?</p>
              </div>
            </div>

            <div className="cool-options">
              {plans?.map((plan) => (
                <button className="cool-option" key={plan.minutes}
                  onClick={() => onStart(plan)}
                  disabled={plan.items.length === 0}>
                  <div>
                    <div className="co-name num">{plan.minutes} minutes</div>
                    <div className="co-blurb">
                      {summarise(plan)}
                    </div>
                  </div>
                  <span className="co-len num">{formatDuration(plan.totalSec)}</span>
                </button>
              ))}
            </div>

            <button className="btn-ghost mt-3" onClick={onSkip}>Skip</button>
          </>
        )}
      </div>
    </Overlay>
  )
}

/**
 * What a block holds. Named rather than counted — "5 holds" tells you nothing
 * about whether it's worth five minutes — but only the first few, or a
 * ten-minute block turns the choice into a paragraph.
 */
function summarise(plan: CooldownPlan): string {
  const n = plan.items.length
  const unit = plan.items[0]?.kind === 'stretch' ? 'hold' : 'movement'
  const shown = plan.items.slice(0, 3).map((i) => i.name).join(' · ')
  const rest = n - Math.min(3, n)
  return `${n} ${unit}${n === 1 ? '' : 's'} — ${shown}${rest > 0 ? ` +${rest} more` : ''}`
}
