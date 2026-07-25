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
    <div className="stepper" role="group" aria-label={label}>
      <div className="label" aria-hidden="true">{label}</div>
      <div className="value num" role="status" aria-live="polite"
        aria-label={`${label}: ${formatNum(value)}${unit ? ` ${unit}` : ''}`}>
        <span aria-hidden="true">{formatNum(value)}{unit && <small> {unit}</small>}</span>
      </div>
      <div className="controls">
        {bigStep && (
          <button aria-label={`${label} down ${bigStep}${unit ? ` ${unit}` : ''}`}
            onClick={() => bump(-bigStep)}>−−</button>
        )}
        <button aria-label={`${label} down ${step}${unit ? ` ${unit}` : ''}`}
          onClick={() => bump(-step)}>−</button>
        <button aria-label={`${label} up ${step}${unit ? ` ${unit}` : ''}`}
          onClick={() => bump(step)}>+</button>
        {bigStep && (
          <button aria-label={`${label} up ${bigStep}${unit ? ` ${unit}` : ''}`}
            onClick={() => bump(bigStep)}>++</button>
        )}
      </div>
    </div>
  )
}

export function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}
