import { useState } from 'react'
import type { Settings } from '../types'
import { getSettings, saveBodyweight, saveSettings } from '../db/db'
import { pushRecord, pushSettings } from '../db/sync'
import { PLATE_PRESETS, makeProfile, parsePlates } from '../engine/equipment'
import { clampFrequency, defaultSplit, dayLabel } from '../engine/schedule'
import { BarbellIcon } from '../components/Icons'

const STEPS = ['Welcome', 'Bodyweight', 'Equipment', 'Frequency'] as const

/**
 * A fresh install used to drop straight into the full app on defaults, with
 * most of what makes it good switched off and nothing saying so: no bodyweight
 * (so pull-up and dip stats silently fall back to added weight only), a guessed
 * plate list that can prescribe weights the gym can't load, and no idea how
 * often you train. Four questions turn all of that on.
 *
 * Every answer is optional — skipping lands you exactly where the app used to
 * start, only deliberately rather than by accident.
 */
export function Onboarding({ onDone }: { onDone: () => Promise<void> }) {
  const [step, setStep] = useState(0)
  const [bodyweight, setBodyweight] = useState('')
  const [presetIndex, setPresetIndex] = useState(0)
  const [barText, setBarText] = useState(String(PLATE_PRESETS[0].barWeightKg))
  const [platesText, setPlatesText] = useState(PLATE_PRESETS[0].platesKg.join(', '))
  const [frequency, setFrequency] = useState(4)
  const [saving, setSaving] = useState(false)

  const pickPreset = (i: number) => {
    setPresetIndex(i)
    setBarText(String(PLATE_PRESETS[i].barWeightKg))
    setPlatesText(PLATE_PRESETS[i].platesKg.join(', '))
  }

  const finish = async (skipped: boolean) => {
    if (saving) return
    setSaving(true)

    const plates = parsePlates(platesText)
    const bar = Number(barText)
    const profile = makeProfile({
      name: 'My gym',
      barWeightKg: Number.isFinite(bar) && bar > 0 ? bar : 20,
      platesKg: plates.length > 0 ? plates : PLATE_PRESETS[0].platesKg,
    })

    const current = await getSettings()
    const next: Settings = {
      ...current,
      onboardedAt: Date.now(),
      ...(skipped
        ? {}
        : {
            barWeightKg: profile.barWeightKg,
            platesKg: profile.platesKg,
            profiles: [profile],
            activeProfileId: profile.id,
            weeklyFrequency: clampFrequency(frequency),
          }),
    }
    const saved = await saveSettings(next)
    void pushSettings(saved)

    const kg = Number(bodyweight)
    if (!skipped && Number.isFinite(kg) && kg > 0) {
      const row = await saveBodyweight(kg)
      void pushRecord('bodyweight', String(row.at), row)
    }

    await onDone()
  }

  return (
    <div className="onboarding">
      <div className="ob-progress" role="progressbar" aria-valuenow={step + 1}
        aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <span key={label} className={`ob-dot${i <= step ? ' on' : ''}`} />
        ))}
      </div>

      <div className="ob-body">
        {step === 0 && (
          <>
            <div className="ob-mark" aria-hidden="true"><BarbellIcon size={30} /></div>
            <h1 className="screen-title">Forge</h1>
            <p className="ob-lede">
              Log your sets and Forge works out what you lift next — progressive overload,
              warm-up ramps, plate math and PR tracking, all on your phone and all offline.
            </p>
            <p className="ob-lede">
              Four quick questions make the suggestions accurate from your first session.
              You can change any of it later in Setup.
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="screen-title">Your bodyweight</h1>
            <p className="ob-lede">
              Pull-ups and dips are loaded by <em>you</em>. Without this, a set of ten
              bodyweight pull-ups records as zero kilos lifted, and their strength trend
              can't be tracked at all.
            </p>
            <label className="ob-field">
              <span>Bodyweight (kg)</span>
              <input type="number" inputMode="decimal" autoFocus placeholder="e.g. 80"
                value={bodyweight} onChange={(e) => setBodyweight(e.target.value)} />
            </label>
            <p className="ob-hint">Optional — you can log it any time from Progress.</p>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="screen-title">Your gym</h1>
            <p className="ob-lede">
              Every barbell target gets rounded to something you can actually load, so the
              plates matter. Pick the closest and adjust.
            </p>
            <div className="ob-presets" role="radiogroup" aria-label="Plate set">
              {PLATE_PRESETS.map((preset, i) => (
                <button key={preset.name} role="radio" aria-checked={presetIndex === i}
                  className={`ob-preset${presetIndex === i ? ' on' : ''}`}
                  onClick={() => pickPreset(i)}>
                  <span className="pname">{preset.name}</span>
                  <span className="pdetail num">{preset.barWeightKg} kg bar · {preset.platesKg.join(', ')}</span>
                </button>
              ))}
            </div>
            <label className="ob-field">
              <span>Bar weight (kg)</span>
              <input type="number" inputMode="decimal" value={barText}
                onChange={(e) => setBarText(e.target.value)} />
            </label>
            <label className="ob-field">
              <span>Plates per side (kg)</span>
              <input value={platesText} onChange={(e) => setPlatesText(e.target.value)} />
            </label>
            <p className="ob-hint">
              Train somewhere else too? Setup → Equipment holds a profile per gym.
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="screen-title">How often do you train?</h1>
            <p className="ob-lede">
              This lays out your week and spaces the rest days. You can rebuild it by hand,
              or build your own split entirely, in Setup.
            </p>
            <div className="seg" role="radiogroup" aria-label="Sessions per week">
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} role="radio" aria-checked={frequency === n}
                  className={frequency === n ? 'on' : ''} onClick={() => setFrequency(n)}>
                  {n}×
                </button>
              ))}
            </div>
            <p className="ob-hint">
              Your week: {defaultSplit(frequency).map(dayLabel).join(' · ')}
            </p>
          </>
        )}
      </div>

      <div className="ob-actions">
        {step < STEPS.length - 1 ? (
          <button className="btn-primary" onClick={() => setStep((n) => n + 1)}>
            {step === 0 ? 'Get started' : 'Next'}
          </button>
        ) : (
          <button className="btn-primary" onClick={() => finish(false)} disabled={saving}>
            {saving ? 'Saving…' : 'Start training'}
          </button>
        )}
        <div className="ob-secondary">
          {step > 0 && (
            <button className="btn-small" onClick={() => setStep((n) => n - 1)}>Back</button>
          )}
          <button className="btn-small" onClick={() => finish(true)} disabled={saving}>
            Skip setup
          </button>
        </div>
      </div>
    </div>
  )
}
