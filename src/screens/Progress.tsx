import { useMemo, useRef, useState } from 'react'
import type { Muscle, Session } from '../types'
import { EXERCISES, getExercise } from '../data/exercises'
import { e1rmTrend, prsFor, volumeByMuscle, type E1rmPoint } from '../engine/stats'
import { performancesOf } from '../engine/history'
import { formatNum } from '../components/Stepper'

/** Validated against the dark surface (dataviz six-checks). */
const MARK = '#f4581f'

const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', core: 'Core',
}

const WEEK = 7 * 86_400_000

export function ProgressScreen({ history }: { history: Session[] }) {
  const trained = useMemo(
    () => EXERCISES.filter((e) => performancesOf(e.id, history).length > 0),
    [history],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const exerciseId = selectedId ?? trained[0]?.id ?? null

  if (history.length === 0) {
    return (
      <>
        <h1 className="screen-title">Progress</h1>
        <div className="empty-state">
          <div className="big">⚡</div>
          Nothing logged yet.<br />
          Finish your first session and the trend lines start here.
        </div>
      </>
    )
  }

  const now = Date.now()
  const trend = exerciseId ? e1rmTrend(exerciseId, history) : []

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
        <div className="chart-title">This week’s volume</div>
        <div className="chart-sub">Tonnage per muscle, secondary work at half credit</div>
        <VolumeBars history={history} now={now} />
      </div>

      <div className="card chart-card">
        <div className="chart-title">Consistency</div>
        <div className="chart-sub">Sessions per week, last 8 weeks</div>
        <FrequencyBars history={history} now={now} />
      </div>

      <div className="section-label">Personal records</div>
      <div className="card">
        <table className="pr-table">
          <tbody>
            {trained.map((e) => {
              const pr = prsFor(e.id, history)
              if (!pr.maxWeight) return null
              return (
                <tr key={e.id}>
                  <td className="ex">{e.name}</td>
                  <td className="val num">{formatNum(pr.maxWeight.weight)} kg × {pr.maxWeight.reps}</td>
                  <td className="est num">e1RM {pr.bestE1rm ? Math.round(pr.bestE1rm.value) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
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

// ── Horizontal magnitude bars: tonnage per muscle ───────
function VolumeBars({ history, now }: { history: Session[]; now: number }) {
  const vol = volumeByMuscle(history, now - WEEK, now + 1)
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
