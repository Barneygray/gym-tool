import { useMemo, useRef, useState } from 'react'
import type { BodyLog, Muscle, Session } from '../types'
import { EXERCISES, getExercise } from '../data/exercises'
import { e1rmTrend, prsFor, volumeByMuscle, type E1rmPoint } from '../engine/stats'
import { bodyweightAt, latestBodyweight } from '../engine/bodyweight'
import { MUSCLE_TARGETS, volumeStatus, weeklySetsByMuscle, type VolumeStatus } from '../engine/volume'
import { performancesOf } from '../engine/history'
import { saveBodyweight } from '../db/db'
import { formatNum } from '../components/Stepper'

/** Validated against the dark surface (dataviz six-checks). */
const MARK = '#f4581f'
const STATUS_COLOR: Record<VolumeStatus, string> = {
  none: 'var(--surface-2)', under: '#eab308', optimal: '#57d98f', high: '#ff5d5d',
}

const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', core: 'Core',
}

const WEEK = 7 * 86_400_000

export function ProgressScreen({ history, bodyLog, onChanged }: {
  history: Session[]
  bodyLog: BodyLog[]
  onChanged: () => Promise<void>
}) {
  const trained = useMemo(
    () => EXERCISES.filter((e) => performancesOf(e.id, history).length > 0),
    [history],
  )
  const bwAt = useMemo(() => bodyweightAt(bodyLog), [bodyLog])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const exerciseId = selectedId ?? trained[0]?.id ?? null

  if (history.length === 0 && bodyLog.length === 0) {
    return (
      <>
        <h1 className="screen-title">Progress</h1>
        <div className="empty-state">
          <div className="big">⚡</div>
          Nothing logged yet.<br />
          Finish your first session and the trend lines start here.
        </div>
        <BodyweightCard bodyLog={bodyLog} onChanged={onChanged} />
      </>
    )
  }

  const now = Date.now()
  const trend = exerciseId ? e1rmTrend(exerciseId, history, bwAt) : []

  return (
    <>
      <h1 className="screen-title">Progress</h1>
      <p className="screen-sub">The proof the plan is working.</p>

      {exerciseId && (
        <>
          <select className="exercise-select" value={exerciseId}
            onChange={(e) => setSelectedId(e.target.value)}>
            {trained.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>

          <div className="card chart-card">
            <div className="chart-title">Estimated 1RM</div>
            <div className="chart-sub">
              {getExercise(exerciseId).name} — Epley, best set per session
            </div>
            <E1rmChart points={trend} />
          </div>
        </>
      )}

      <div className="card chart-card">
        <div className="chart-title">Weekly hard sets</div>
        <div className="chart-sub">Per muscle vs. its effective range, last 7 days</div>
        <WeeklySets history={history} now={now} />
      </div>

      <div className="card chart-card">
        <div className="chart-title">This week’s volume</div>
        <div className="chart-sub">Tonnage per muscle, secondary work at half credit</div>
        <VolumeBars history={history} now={now} bwAt={bwAt} />
      </div>

      <BodyweightCard bodyLog={bodyLog} onChanged={onChanged} />

      <div className="card chart-card">
        <div className="chart-title">Consistency</div>
        <div className="chart-sub">Sessions per week, last 8 weeks</div>
        <FrequencyBars history={history} now={now} />
      </div>

      {trained.length > 0 && (
        <>
          <div className="section-label">Personal records</div>
          <div className="card">
            <table className="pr-table">
              <tbody>
                {trained.map((e) => {
                  const pr = prsFor(e.id, history, bwAt)
                  if (!pr.maxWeight) return null
                  return (
                    <tr key={e.id}>
                      <td className="ex">{e.name}</td>
                      <td className="val num">{formatNum(Math.round(pr.maxWeight.weight * 10) / 10)} kg × {pr.maxWeight.reps}</td>
                      <td className="est num">e1RM {pr.bestE1rm ? Math.round(pr.bestE1rm.value) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

// ── Bodyweight: quick-log + trend ───────────────────────
function BodyweightCard({ bodyLog, onChanged }: { bodyLog: BodyLog[]; onChanged: () => Promise<void> }) {
  const [value, setValue] = useState('')
  const current = latestBodyweight(bodyLog)

  const save = async () => {
    const kg = Number(value)
    if (!Number.isFinite(kg) || kg <= 0) return
    await saveBodyweight(kg)
    setValue('')
    await onChanged()
  }

  const first = bodyLog.length > 0 ? bodyLog.reduce((a, b) => (b.at < a.at ? b : a)).kg : null
  const delta = current !== null && first !== null ? current - first : null

  return (
    <div className="card chart-card">
      <div className="chart-title">Bodyweight</div>
      <div className="chart-sub">
        {current !== null
          ? `Now ${formatNum(current)} kg${delta !== null && Math.abs(delta) >= 0.1 ? ` · ${delta > 0 ? '+' : ''}${formatNum(Math.round(delta * 10) / 10)} kg since start` : ''} · sharpens pull-up & dip stats`
          : 'Log it to track the trend and get accurate pull-up / dip loads'}
      </div>
      {bodyLog.length >= 2 && <BodyweightChart points={bodyLog} />}
      <div style={{ display: 'flex', gap: 8, marginTop: bodyLog.length >= 2 ? 12 : 4 }}>
        <input style={{ flex: 1 }} type="number" inputMode="decimal" placeholder="Today’s weight (kg)"
          value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="btn-small accent" onClick={save} disabled={!value}>Log</button>
      </div>
    </div>
  )
}

// ── Single-series e1RM line with tap-to-inspect ─────────
function E1rmChart({ points }: { points: E1rmPoint[] }) {
  const [picked, setPicked] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const W = 340
  const H = 170
  const PAD = { l: 34, r: 14, t: 12, b: 22 }

  if (points.length === 0) {
    return <div className="empty-state" style={{ padding: '28px 0' }}>No sessions for this lift yet.</div>
  }

  const xs = points.map((p) => p.date)
  const ys = points.map((p) => p.e1rm)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const yPad = Math.max((yMax - yMin) * 0.15, 2.5)
  const lo = Math.max(0, yMin - yPad)
  const hi = yMax + yPad

  const px = (d: number) => x1 === x0
    ? PAD.l + (W - PAD.l - PAD.r) / 2
    : PAD.l + ((d - x0) / (x1 - x0)) * (W - PAD.l - PAD.r)
  const py = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.date).toFixed(1)},${py(p.e1rm).toFixed(1)}`).join(' ')
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, lo + (hi - lo) * 0.85].map((v) => Math.round(v))

  const pick = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const gx = ((clientX - rect.left) / rect.width) * W
    let best = 0
    let bestDist = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(px(p.date) - gx)
      if (d < bestDist) { bestDist = d; best = i }
    })
    setPicked(best)
  }

  const sel = picked !== null ? points[picked] : null
  const last = points[points.length - 1]

  return (
    <>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Estimated one rep max trend, ${points.length} sessions, latest ${Math.round(last.e1rm)} kilograms`}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => e.buttons > 0 && pick(e.clientX)}
        onPointerLeave={() => setPicked(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)}
              stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={py(t) + 3.5} textAnchor="end" fontSize="10"
              fill="var(--text-faint)" className="num">{t}</text>
          </g>
        ))}

        <path d={path} fill="none" stroke={MARK} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={px(p.date)} cy={py(p.e1rm)}
            r={picked === i ? 5 : points.length <= 14 ? 3.5 : 2.5}
            fill={MARK} stroke="var(--surface)" strokeWidth="2" />
        ))}

        {/* direct label on the latest point */}
        {picked === null && (
          <text x={Math.min(px(last.date), W - PAD.r - 4)} y={py(last.e1rm) - 9}
            textAnchor="end" fontSize="11.5" fontWeight="700" fill="var(--text)"
            className="num">{Math.round(last.e1rm)} kg</text>
        )}

        {sel && (
          <g>
            <line x1={px(sel.date)} x2={px(sel.date)} y1={PAD.t} y2={H - PAD.b}
              stroke="var(--line-strong)" strokeWidth="1" />
            <text x={W / 2} y={PAD.t + 2} textAnchor="middle" fontSize="11"
              fill="var(--text-dim)" className="num">
              {fmtDate(sel.date)} — {Math.round(sel.e1rm)} kg
            </text>
          </g>
        )}

        <text x={PAD.l} y={H - 6} fontSize="10" fill="var(--text-faint)">{fmtDate(x0)}</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="10" fill="var(--text-faint)">{fmtDate(x1)}</text>
      </svg>
    </>
  )
}

// ── Weekly hard sets per muscle vs. MEV/MRV band ────────
function WeeklySets({ history, now }: { history: Session[]; now: number }) {
  const sets = weeklySetsByMuscle(history, now - WEEK, now + 1)
  const rows = [...sets.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])

  if (rows.length === 0) {
    return <div className="empty-state" style={{ padding: '24px 0' }}>No training in the last 7 days.</div>
  }

  const W = 340
  const ROW = 30
  const H = rows.length * ROW + 6
  const LABEL_W = 82
  const TRACK_X = LABEL_W
  const TRACK_W = W - LABEL_W - 40
  // Shared scale so bars compare; headroom above the largest MRV or set count.
  const scaleMax = Math.max(
    ...rows.map(([m, n]) => Math.max(n, MUSCLE_TARGETS[m].mrv)),
  ) * 1.08
  const sx = (n: number) => (n / scaleMax) * TRACK_W

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly hard sets per muscle against effective range">
        {rows.map(([muscle, n], i) => {
          const y = i * ROW + 5
          const status = volumeStatus(muscle, n)
          const { mev, mrv } = MUSCLE_TARGETS[muscle]
          return (
            <g key={muscle}>
              <text x={LABEL_W - 8} y={y + 12} textAnchor="end" fontSize="11.5" fill="var(--text-dim)">
                {MUSCLE_LABEL[muscle]}
              </text>
              {/* MEV–MRV target band */}
              <rect x={TRACK_X + sx(mev)} y={y} width={Math.max(sx(mrv) - sx(mev), 1)} height={17} rx="3"
                fill="var(--green-soft)" stroke="var(--line)" strokeWidth="0.5" />
              {/* actual sets */}
              <rect x={TRACK_X} y={y + 3} width={Math.max(sx(n), 2)} height={11} rx="3" fill={STATUS_COLOR[status]} />
              <text x={TRACK_X + Math.max(sx(n), 2) + 6} y={y + 12.5} fontSize="11" fill="var(--text-faint)" className="num">
                {formatNum(Math.round(n * 10) / 10)}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="vol-legend">
        <span><i style={{ background: STATUS_COLOR.under }} />Below range</span>
        <span><i style={{ background: STATUS_COLOR.optimal }} />In range</span>
        <span><i style={{ background: STATUS_COLOR.high }} />Over range</span>
      </div>
    </>
  )
}

// ── Bodyweight trend line ───────────────────────────────
function BodyweightChart({ points }: { points: BodyLog[] }) {
  const pts = [...points].sort((a, b) => a.at - b.at)
  const W = 340
  const H = 120
  const PAD = { l: 34, r: 14, t: 12, b: 20 }

  const xs = pts.map((p) => p.at)
  const ys = pts.map((p) => p.kg)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const yPad = Math.max((yMax - yMin) * 0.2, 0.5)
  const lo = yMin - yPad
  const hi = yMax + yPad

  const px = (d: number) => x1 === x0
    ? PAD.l + (W - PAD.l - PAD.r) / 2
    : PAD.l + ((d - x0) / (x1 - x0)) * (W - PAD.l - PAD.r)
  const py = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.at).toFixed(1)},${py(p.kg).toFixed(1)}`).join(' ')
  const ticks = [lo + (hi - lo) * 0.2, lo + (hi - lo) * 0.8].map((v) => Math.round(v * 10) / 10)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bodyweight trend, latest ${ys[ys.length - 1]} kilograms`}
      style={{ marginTop: 4 }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)} stroke="var(--line)" strokeWidth="1" />
          <text x={PAD.l - 6} y={py(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-faint)" className="num">{t}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke={MARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={px(p.at)} cy={py(p.kg)} r={pts.length <= 20 ? 3 : 2} fill={MARK}
          stroke="var(--surface)" strokeWidth="2" />
      ))}
    </svg>
  )
}

// ── Horizontal magnitude bars: tonnage per muscle ───────
function VolumeBars({ history, now, bwAt }: { history: Session[]; now: number; bwAt: ReturnType<typeof bodyweightAt> }) {
  const vol = volumeByMuscle(history, now - WEEK, now + 1, bwAt)
  const rows = [...vol.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])

  if (rows.length === 0) {
    return <div className="empty-state" style={{ padding: '24px 0' }}>No training in the last 7 days.</div>
  }

  const W = 340
  const ROW = 26
  const H = rows.length * ROW + 4
  const LABEL_W = 82
  const max = rows[0][1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly tonnage per muscle group">
      {rows.map(([muscle, v], i) => {
        const y = i * ROW + 4
        const w = Math.max(((W - LABEL_W - 56) * v) / max, 3)
        return (
          <g key={muscle}>
            <text x={LABEL_W - 8} y={y + 13} textAnchor="end" fontSize="11.5"
              fill="var(--text-dim)">{MUSCLE_LABEL[muscle]}</text>
            <rect x={LABEL_W} y={y} width={w} height={16} rx="4" fill={MARK} />
            <text x={LABEL_W + w + 7} y={y + 12.5} fontSize="11" fill="var(--text-faint)"
              className="num">{Math.round(v).toLocaleString()}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Sessions per week ───────────────────────────────────
function FrequencyBars({ history, now }: { history: Session[]; now: number }) {
  const weeks: number[] = Array.from({ length: 8 }, (_, i) => {
    const from = now - (8 - i) * WEEK
    const to = from + WEEK
    return history.filter((s) => s.dayType !== 'conditioning' && s.startedAt >= from && s.startedAt < to).length
  })
  const W = 340
  const H = 92
  const max = Math.max(...weeks, 4)
  const bw = 28
  const gap = (W - 8 * bw) / 9

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gym sessions per week, last 8 weeks">
      {weeks.map((n, i) => {
        const h = n === 0 ? 2 : (n / max) * (H - 30)
        const x = gap + i * (bw + gap)
        const y = H - 18 - h
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={h} rx="4"
              fill={n === 0 ? 'var(--surface-2)' : MARK} />
            {n > 0 && (
              <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize="11"
                fontWeight="700" fill="var(--text-dim)" className="num">{n}</text>
            )}
            <text x={x + bw / 2} y={H - 5} textAnchor="middle" fontSize="9.5"
              fill="var(--text-faint)">{i === 7 ? 'now' : `-${7 - i}w`}</text>
          </g>
        )
      })}
    </svg>
  )
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`
}
