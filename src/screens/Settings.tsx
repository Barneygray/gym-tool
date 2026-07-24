import { useRef, useState } from 'react'
import type { Settings } from '../types'
import { exportData, importData, saveSettings, wipeAll } from '../db/db'
import { pushSettings, supabaseConfigured } from '../db/sync'

interface SettingsProps {
  settings: Settings
  onChanged: () => Promise<void>
  syncing: boolean
  onSyncNow: () => Promise<void>
}

export function SettingsScreen({ settings, onChanged, syncing, onSyncNow }: SettingsProps) {
  const [platesText, setPlatesText] = useState(settings.platesKg.join(', '))
  const [status, setStatus] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const update = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    await saveSettings(next)
    void pushSettings(next)
    await onChanged()
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
            <div className="settings-row">
              <div>
                <div className="k">{syncing ? 'Syncing…' : 'Cloud sync on ✓'}</div>
                <div className="sub">Every session saves to the cloud automatically. Open the app on any device to get your full history back.</div>
              </div>
              <button className="btn-small" onClick={() => onSyncNow()} disabled={syncing}>
                {syncing ? '…' : 'Sync now'}
              </button>
            </div>
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
