import type { DayId, Settings, WeekPlan } from '../../types'
import { DAYS } from '../../data/days'
import { autoWeekPlan, clampFrequency, defaultSplit, dayLabel } from '../../engine/schedule'
import { SetupPage, type UpdateSettings } from './shared'

const WEEKDAY_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function SchedulePage({ settings, update, onBack }: {
  settings: Settings
  update: UpdateSettings
  onBack: () => void
}) {
  return (
    <SetupPage
      title="Weekly plan"
      blurb="Which day the coach hands you when you open Train, and how many sessions a week it expects."
      onBack={onBack}
    >
      <WeeklyPlan settings={settings} update={update} />
    </SetupPage>
  )
}

/**
 * Two modes. Automatic derives the week from a session count and the built-in
 * split — the original behaviour, and still the right default. Custom hands
 * over all seven days, and unlike the automatic plan it can schedule *any* day
 * template, so a program built in the Program section actually shows up on the
 * Train screen instead of being crowded out by push/pull/legs.
 */
function WeeklyPlan({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const freq = clampFrequency(settings.weeklyFrequency ?? 4)
  const plan = settings.weekPlan ?? null

  const setSlot = (weekday: number, id: DayId | null) => {
    // Editing an automatic week forks it into a custom one, seeded with what's
    // already on screen — so the first edit never wipes the rest of the week.
    const base: WeekPlan = plan ?? autoWeekPlan(freq)
    const next = base.map((slot, i) => (i === weekday ? id : slot))
    return update({ weekPlan: next })
  }

  return (
    <>
      <div className="section-label">Frequency</div>
      <div className="card pane">
        <div className="settings-row">
          <div>
            <div className="k">Sessions per week</div>
            <div className="sub">
              {plan
                ? 'Not used while you’re running a custom plan.'
                : `Lays out your week as ${defaultSplit(freq).map(dayLabel).join(' · ')}`}
            </div>
          </div>
          <select value={freq} disabled={plan !== null}
            onChange={(e) => update({ weeklyFrequency: Number(e.target.value) })}>
            {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}×</option>)}
          </select>
        </div>
      </div>

      <div className="section-label">
        <span>Your week</span>
        {plan && <span className="ok">Custom</span>}
      </div>
      <div className="card pane">
        <div className="settings-row stack">
          <div className="sub">
            {plan
              ? 'Any day you’ve built can go anywhere. Set every day to Rest to hand the week back to the automatic plan.'
              : 'Assign your own days to weekdays — including the ones you built in Program.'}
          </div>
          <div className="plan-editor">
            {(plan ?? autoWeekPlan(freq)).map((slot, wd) => (
              <label className="plan-editor-row" key={wd}>
                <span className="wd-name">{WEEKDAY_NAME[wd]}</span>
                <select value={slot ?? ''} onChange={(e) => setSlot(wd, e.target.value || null)}>
                  <option value="">Rest</option>
                  {DAYS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            ))}
          </div>
          {plan && (
            <button className="btn-small" style={{ marginTop: 'var(--s3)' }}
              onClick={() => update({ weekPlan: null })}>
              Back to the automatic plan
            </button>
          )}
        </div>
      </div>
    </>
  )
}
