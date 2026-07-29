import { useState } from 'react'
import type { Settings } from '../../types'
import { notificationPermission, notificationsSupported, requestNotifications } from '../../notify'
import { SetupPage, type UpdateSettings } from './shared'

const REMINDER_HOURS = [7, 9, 12, 15, 17, 19]

export const fmtHour = (h: number) => {
  const am = h < 12
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${am ? 'am' : 'pm'}`
}

export function AlertsPage({ settings, update, onBack }: {
  settings: Settings
  update: UpdateSettings
  onBack: () => void
}) {
  return (
    <SetupPage
      title="Alerts"
      blurb="Everything the app is allowed to interrupt you for: the end of a rest period, and the daily nudge to get a session in."
      onBack={onBack}
    >
      <div className="section-label">Rest timer</div>
      <div className="card pane">
        <div className="settings-row">
          <div>
            <div className="k">Rest timer sound</div>
            <div className="sub">Chime when rest is up</div>
          </div>
          <button
            className={`toggle${settings.soundOn ? ' on' : ''}`}
            role="switch"
            aria-checked={settings.soundOn}
            aria-label="Rest timer sound"
            onClick={() => update({ soundOn: !settings.soundOn })}
          />
        </div>
        <RestAlertsRow />
      </div>

      <div className="section-label">Daily reminder</div>
      <Reminders settings={settings} update={update} />
    </SetupPage>
  )
}

// ── Rest alerts (background notifications) ───────────────
function RestAlertsRow() {
  const [perm, setPerm] = useState(notificationPermission())
  if (!notificationsSupported()) return null

  const enable = async () => setPerm(await requestNotifications())

  return (
    <div className="settings-row">
      <div>
        <div className="k">Rest alerts</div>
        <div className="sub">
          {perm === 'granted' ? 'Notifies you when rest is up, even with the app in the background'
            : perm === 'denied' ? 'Blocked — enable notifications for this site in your browser'
            : 'Get a notification when rest is up, even if the screen’s off'}
        </div>
      </div>
      {perm === 'granted'
        ? <span className="micro ok">Enabled</span>
        : <button className="btn-small accent" onClick={enable} disabled={perm === 'denied'}>Enable</button>}
    </div>
  )
}

// ── Daily training reminder ─────────────────────────────
function Reminders({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const on = !!settings.reminder
  const hour = settings.reminder?.hour ?? 17
  const [perm, setPerm] = useState(notificationPermission())

  const toggle = () => update({ reminder: on ? null : { hour } })
  const setHour = (h: number) => update({ reminder: { hour: h } })
  const enableNotifs = async () => setPerm(await requestNotifications())

  return (
    <div className="card pane">
      <div className="settings-row">
        <div>
          <div className="k">Time to train</div>
          <div className="sub">A daily nudge to train if you haven’t yet — names the day the coach picks.</div>
        </div>
        <button className={`toggle${on ? ' on' : ''}`} role="switch" aria-checked={on}
          aria-label="Time-to-train reminder" onClick={toggle} />
      </div>
      {on && (
        <>
          <div className="settings-row stack">
            <div className="k">Remind me at</div>
            <div className="seg" role="radiogroup" aria-label="Reminder time" style={{ marginTop: 'var(--s3)' }}>
              {REMINDER_HOURS.map((h) => (
                <button key={h} role="radio" aria-checked={hour === h}
                  className={hour === h ? 'on' : ''} onClick={() => setHour(h)}>{fmtHour(h)}</button>
              ))}
            </div>
          </div>
          {notificationsSupported() && perm !== 'granted' && (
            <div className="settings-row">
              <div>
                <div className="k">Allow notifications</div>
                <div className="sub">
                  {perm === 'denied'
                    ? 'Blocked — enable notifications for this site in your browser'
                    : 'Needed to nudge you; otherwise it only shows when the app is open'}
                </div>
              </div>
              <button className="btn-small accent" onClick={enableNotifs} disabled={perm === 'denied'}>Enable</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
