interface StepperProps {
  label: string
  value: number
  unit?: string
  step: number
  bigStep?: number
  min?: number
  onChange: (v: number) => void
}

export function Stepper({ label, value, unit, step, bigStep, min = 0, onChange }: StepperProps) {
  const bump = (delta: number) => onChange(Math.max(min, Math.round((value + delta) * 100) / 100))
  return (
    <div className="stepper">
      <div className="label">{label}</div>
      <div className="value num">
        {formatNum(value)}
        {unit && <small> {unit}</small>}
      </div>
      <div className="controls">
        {bigStep && <button onClick={() => bump(-bigStep)}>−−</button>}
        <button onClick={() => bump(-step)}>−</button>
        <button onClick={() => bump(step)}>+</button>
        {bigStep && <button onClick={() => bump(bigStep)}>++</button>}
      </div>
    </div>
  )
}

export function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}
