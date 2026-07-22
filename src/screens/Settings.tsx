import { useRef, useState } from 'react'
import type { Settings } from '../types'
import { exportData, importData, saveSettings, wipeAll } from '../db/db'
import { pushSettings, signInWithEmail, signOut, supabaseConfigured, verifyEmailCode } from '../db/sync'

interface SettingsProps {
  settings: Settings
  onChanged: () => Promise<void>
  syncEmail: string | null
  syncing: boolean
}

export function SettingsScreen({ settings, onChanged, syncEmail, syncing }: SettingsProps) {
  const [platesText, setPlatesText] = useState(settings.platesKg.join(', '))
  const [status, setStatus] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const update = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    await saveSettings(next)
    void pushSettings(next)
    await onChanged()
  }

  const sendCode = async () => {
    setAuthError(null)
    const error = await signInWithEmail(email.trim())
    if (error) setAuthError(error)
    else setCodeSent(true)
  }

  const verifyCode = async () => {
    setAuthError(null)
    setVerifying(true)
    const error = await verifyEmailCode(email.trim(), code)
    setVerifying(false)
    if (error) setAuthError(error)
    // On success, onAuthChange in App fires and swaps this card to "Backed up".
  }

  const savePlates = async () => {
    const plates = platesText
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a)
    if (plates.length > 0) {
      await update({ platesKg: plates })
      setPlatesText(plates.join(', '))
      flash('Plates saved')
    }
  }

  const flash = (msg: string) => {
    setStatus(msg)
    setTimeout(() => setStatus(null), 2500)
  }

  const doExport = async () => {
    const json = await exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forge-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    flash('Backup downloaded')
  }

  const doImport = async (file: File) => {
    try {
      const count = await importData(await file.text())
      await onChanged()
      flash(`Restored ${count} sessions`)
    } catch {
      flash('Import failed — not a valid backup')
    }
  }

  const doWipe = async () => {
    if (window.confirm('Delete ALL training history and settings? This cannot be undone.')) {
      await wipeAll()
      await onChanged()
      flash('Everything wiped')
    }
  }

  return (
    <>
      <h1 className="screen-title">Setup</h1>
      <p className="screen-sub">Your gym, your bar, your data.</p>

      <div className="section-label">Equipment</div>
      <div className="card">
        <div className="settings-row">
          <div>
            <div className="k">Bar weight</div>
            <div className="sub">Used for plate math and warm-ups</div>
          </div>
          <input type="number" inputMode="decimal" value={settings.barWeightKg}
            onChange={(e) => update({ barWeightKg: Number(e.target.value) || 20 })} />
        </div>
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div>
            <div className="k">Plates available (kg, per side)</div>
            <div className="sub">Comma separated — determines loadable weights</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input style={{ flex: 1 }} value={platesText}
              onChange={(e) => setPlatesText(e.target.value)} onBlur={savePlates} />
            <button className="btn-small accent" onClick={savePlates}>Save</button>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="k">Rest timer sound</div>
            <div className="sub">Chime when rest is up</div>
          </div>
          <button
            className={`toggle${settings.soundOn ? ' on' : ''}`}
            aria-label="Toggle sound"
            onClick={() => update({ soundOn: !settings.soundOn })}
          />
        </div>
      </div>

      {supabaseConfigured && (
        <>
          <div className="section-label">Cloud Backup</div>
          <div className="card">
            {syncEmail ? (
              <div className="settings-row">
                <div>
                  <div className="k">{syncing ? 'Syncing…' : 'Backed up ✓'}</div>
                  <div className="sub">Signed in as {syncEmail} — restores automatically on any device</div>
                </div>
                <button className="btn-small" onClick={() => signOut()}>Sign out</button>
              </div>
            ) : codeSent ? (
              <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div>
                  <div className="k">Enter your code</div>
                  <div className="sub">We emailed a 6-digit code to {email}. Type it here to finish — no need to leave the app.</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input style={{ flex: 1, letterSpacing: '0.25em', textAlign: 'center' }}
                    type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    placeholder="123456" value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                  <button className="btn-small accent" onClick={verifyCode} disabled={code.length < 6 || verifying}>
                    {verifying ? '…' : 'Verify'}
                  </button>
                </div>
                <button className="btn-small" style={{ marginTop: 8, alignSelf: 'flex-start' }}
                  onClick={() => { setCodeSent(false); setCode(''); setAuthError(null) }}>
                  Use a different email
                </button>
                {authError && <div className="sub" style={{ color: '#ff5d5d', marginTop: 8 }}>{authError}</div>}
              </div>
            ) : (
              <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div>
                  <div className="k">Back up to the cloud</div>
                  <div className="sub">Sign in with just your email — no password. Every session you log gets saved automatically, so losing or replacing your phone won't lose your history.</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input style={{ flex: 1 }} type="email" inputMode="email" autoComplete="email"
                    placeholder="you@email.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} />
                  <button className="btn-small accent" onClick={sendCode} disabled={!email.includes('@')}>
                    Send code
                  </button>
                </div>
                {authError && <div className="sub" style={{ color: '#ff5d5d', marginTop: 8 }}>{authError}</div>}
              </div>
            )}
          </div>
        </>
      )}

      <div className="section-label">Data</div>
      <div className="card">
        <div className="settings-row">
          <div>
            <div className="k">Export backup</div>
            <div className="sub">Full history as JSON — keep a copy safe</div>
          </div>
          <button className="btn-small accent" onClick={doExport}>Export</button>
        </div>
        <div className="settings-row">
          <div>
            <div className="k">Restore backup</div>
            <div className="sub">Replaces everything with the file’s contents</div>
          </div>
          <button className="btn-small" onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept="application/json" hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) doImport(f)
              e.target.value = ''
            }} />
        </div>
        <div className="settings-row">
          <div>
            <div className="k danger">Wipe everything</div>
            <div className="sub">All sessions and settings, gone</div>
          </div>
          <button className="btn-small danger" onClick={doWipe}>Wipe</button>
        </div>
      </div>

      {status && (
        <p style={{ textAlign: 'center', color: 'var(--green)', marginTop: 16, fontSize: 14 }}>
          {status}
        </p>
      )}
    </>
  )
}
