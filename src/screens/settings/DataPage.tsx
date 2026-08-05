import { useEffect, useRef, useState } from 'react'
import {
  exportData, getRestoreSnapshot, importData, parseBackup, summarizeBackup, summarizeLocal,
  undoRestore, wipeAll, type BackupSummary,
} from '../../db/db'
import {
  generateSyncKey, getSyncKey, setSyncKey, supabaseConfigured,
} from '../../db/sync'
import { SetupPage } from './shared'

/**
 * Backup lives on its own page for the same reason a bank puts the vault down
 * a corridor: everything here is about the copy of your training that outlives
 * this phone, and the last row on it deletes the lot. Mixed into the settings
 * list, "Wipe everything" sat one thumb-width from "Rest timer sound".
 */
export function DataPage({ onChanged, onBack, syncing, onSyncNow, syncError }: {
  onChanged: () => Promise<void>
  onBack: () => void
  syncing: boolean
  onSyncNow: () => Promise<void>
  syncError: string | null
}) {
  const [status, setStatus] = useState<string | null>(null)
  const [undoable, setUndoable] = useState(false)
  const [local, setLocal] = useState<BackupSummary | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // A stashed snapshot survives a reload, so the undo offer should too.
  useEffect(() => {
    void getRestoreSnapshot().then((s) => setUndoable(s !== undefined))
  }, [])

  const reloadLocal = () => void summarizeLocal().then(setLocal)
  useEffect(reloadLocal, [])

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

  /**
   * A restore replaces everything, so it asks first — and says exactly what it
   * is replacing and with what. The dangerous case this closes is a file that
   * parses fine but is empty or from the wrong app: it used to sail through the
   * one `Array.isArray` check and silently wipe the history it "restored".
   */
  const doImport = async (file: File) => {
    let backup
    try {
      backup = parseBackup(await file.text())
    } catch {
      flash('Import failed — not a valid backup')
      return
    }
    const incoming = summarizeBackup(backup)
    const current = await summarizeLocal()
    const dated = incoming.exportedAt ? ` from ${new Date(incoming.exportedAt).toLocaleDateString()}` : ''
    const ok = window.confirm(
      `Restore this backup${dated}?\n\n` +
      `It holds ${incoming.sessions} sessions, ${incoming.exercises} custom exercises, ` +
      `${incoming.days} custom days, ${incoming.goals} goals, ${incoming.bodyweights} bodyweight entries.\n\n` +
      `This replaces what's on this device (${current.sessions} sessions). ` +
      `You can undo it straight afterwards.`,
    )
    if (!ok) return
    try {
      const count = await importData(await file.text())
      await onChanged()
      setUndoable(true)
      reloadLocal()
      flash(`Restored ${count} sessions`)
    } catch {
      flash('Import failed — nothing was changed')
    }
  }

  const doUndo = async () => {
    if (!window.confirm('Put back everything the last restore replaced?')) return
    const done = await undoRestore()
    await onChanged()
    setUndoable(false)
    reloadLocal()
    flash(done ? 'Restore undone' : 'Nothing to undo')
  }

  const doWipe = async () => {
    if (window.confirm('Delete ALL training history and settings? This cannot be undone.')) {
      await wipeAll()
      await onChanged()
      reloadLocal()
      flash('Everything wiped')
    }
  }

  return (
    <SetupPage
      title="Backup"
      blurb="Where your training lives, and how to get it onto another phone — or back after one is lost."
      onBack={onBack}
    >
      <div className="section-label">On this device</div>
      <div className="card pane">
        <div className="settings-row stack">
          <div className="sub">
            Everything is stored in this browser first. Nothing here needs a network to work.
          </div>
          <dl className="data-counts">
            <Count n={local?.sessions} label="Sessions" />
            <Count n={local?.exercises} label="Custom exercises" />
            <Count n={local?.days} label="Custom days" />
            <Count n={local?.goals} label="Goals" />
            <Count n={local?.bodyweights} label="Bodyweight entries" />
          </dl>
        </div>
      </div>

      {supabaseConfigured && (
        <>
          <div className="section-label">Cloud backup</div>
          <div className="card pane">
            <div className="settings-row">
              <div>
                <div className="k">
                  {syncing ? 'Syncing…' : syncError ? 'Backup problem' : <>Cloud sync <span className="ok">· on</span></>}
                </div>
                <div className="sub">
                  Every session — including edits and deletions — saves to the cloud automatically.
                  Open the app on any device to get your full history back.
                </div>
              </div>
              <button className="btn-small" onClick={() => onSyncNow()} disabled={syncing}>
                {syncing ? '…' : 'Sync now'}
              </button>
            </div>
            {syncError && !syncing && (
              <div className="sub danger" style={{ marginTop: 'var(--s1)' }}>
                {syncError} We’ll retry on the next change or sync.
              </div>
            )}
            <PrivateSyncKey onSyncNow={onSyncNow} />
          </div>
        </>
      )}

      <div className="section-label">Backup file</div>
      <div className="card pane">
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
            <div className="sub">
              Replaces everything with the file’s contents — you’ll see what it holds before it runs
            </div>
          </div>
          <button className="btn-small" onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept="application/json" hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
              e.target.value = ''
            }} />
        </div>
        {undoable && (
          <div className="settings-row">
            <div>
              <div className="k">Undo last restore</div>
              <div className="sub">Puts back everything the restore replaced</div>
            </div>
            <button className="btn-small accent" onClick={doUndo}>Undo</button>
          </div>
        )}
      </div>

      <div className="section-label">Danger zone</div>
      <div className="card pane">
        <div className="settings-row">
          <div>
            <div className="k danger">Wipe everything</div>
            <div className="sub">
              All sessions and settings on this device, gone — there’s no undo for this one.
              Export a backup first if you might want any of it back.
            </div>
          </div>
          <button className="btn-small danger" onClick={doWipe}>Wipe</button>
        </div>
      </div>

      {status && <p className="flash">{status}</p>}
    </SetupPage>
  )
}

function Count({ n, label }: { n: number | undefined; label: string }) {
  return (
    <div className="data-count">
      <dt>{label}</dt>
      <dd className="num">{n ?? '—'}</dd>
    </div>
  )
}

// ── Private cloud-backup key ────────────────────────────
/**
 * The key is the whole access-control story: rows are scoped to a bucket named
 * `forge-<sha256(key)>`, so holding the key is what reaches the data. New
 * installs get a random one automatically; this pane exists to show it (so a
 * second device can be paired), to let it be replaced, and to offer the switch
 * to installs still on the old shared bucket.
 */
function PrivateSyncKey({ onSyncNow }: { onSyncNow: () => Promise<void> }) {
  const [key, setKey] = useState<string | null>(getSyncKey())
  const [entering, setEntering] = useState(false)
  const [value, setValue] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  const apply = async (next: string) => {
    const trimmed = next.trim()
    if (trimmed.length < 4) return
    setSyncKey(trimmed)
    setKey(trimmed)
    setEntering(false)
    setValue('')
    setRevealed(false)
    // Re-syncing under the new bucket re-uploads everything held locally.
    await onSyncNow()
  }

  const copy = async () => {
    if (!key) return
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setRevealed(true)
    }
  }

  const goPrivate = async () => {
    if (!window.confirm('Move this device to its own private backup bucket? Your history re-uploads under the new key. Save the key — you need it to reach this backup from another device.')) return
    await apply(generateSyncKey())
    setRevealed(true)
  }

  const useShared = async () => {
    if (!window.confirm('Switch back to the shared public bucket? Anyone who finds this app’s URL can read or overwrite data there. Your private backup stays in the cloud but this device stops using it.')) return
    setSyncKey(null)
    setKey(null)
    setRevealed(false)
    await onSyncNow()
  }

  return (
    <div className="settings-row sync-key">
      <div>
        <div className="k">
          {key ? <>Private backup <span className="ok">· on</span></> : 'Shared public bucket'}
        </div>
        <div className="sub">
          {key
            ? 'Your backup lives in a bucket only this key can address. Enter the same key on another device to share history.'
            : 'This device is on the bucket every install used to share — its name ships in the app, so anyone with the URL can read or overwrite it. Switching gives you a bucket of your own.'}
        </div>
      </div>

      {key && !entering && (
        <>
          <div className="key-display num">{revealed ? key : '•••••-•••••-•••••-•••••'}</div>
          <div className="key-actions">
            <button className="btn-small" onClick={() => setRevealed((r) => !r)}>
              {revealed ? 'Hide' : 'Reveal'}
            </button>
            <button className="btn-small accent" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            <button className="btn-small" onClick={() => setEntering(true)}>Enter a key</button>
          </div>
          <div className="sub" style={{ marginTop: 'var(--s2)' }}>
            Keep a copy somewhere safe. Lose it and this device still has your data, but no new
            device can reach the backup.
          </div>
        </>
      )}

      {entering && (
        <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 'var(--s3)' }}>
          <input style={{ flex: 1, minWidth: 0 }} placeholder="Paste a key from another device" value={value}
            onChange={(e) => setValue(e.target.value)} autoFocus />
          <button className="btn-small accent" onClick={() => apply(value)} disabled={value.trim().length < 4}>
            Use it
          </button>
          <button className="btn-small" onClick={() => { setEntering(false); setValue('') }}>Cancel</button>
        </div>
      )}

      {!key && !entering && (
        <div className="key-actions">
          <button className="btn-small accent" onClick={goPrivate}>Give me a private bucket</button>
          <button className="btn-small" onClick={() => setEntering(true)}>Enter a key</button>
        </div>
      )}

      {key && !entering && (
        <button className="btn-small danger" style={{ marginTop: 'var(--s3)', alignSelf: 'flex-start' }}
          onClick={useShared}>
          Use the shared bucket
        </button>
      )}
    </div>
  )
}
