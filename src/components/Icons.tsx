interface IconProps {
  size?: number
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const BarbellIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 12h2M19 12h2M7 12h10" />
    <rect x="5" y="8" width="2.4" height="8" rx="1" />
    <rect x="16.6" y="8" width="2.4" height="8" rx="1" />
    <rect x="8.6" y="6.5" width="2.4" height="11" rx="1" />
    <rect x="13" y="6.5" width="2.4" height="11" rx="1" />
  </svg>
)

export const StretchIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="4.5" r="1.9" />
    <path d="M12 7v5l-4.5 7M12 12l4.5 7M12 9.5 5 8M12 9.5 19 8" />
  </svg>
)

export const KettlebellIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M9 8.5V6a3 3 0 0 1 6 0v2.5" />
    <path d="M6.5 14.5a5.5 5.5 0 1 1 11 0c0 2.2-1.2 4-2.5 5.5h-6c-1.3-1.5-2.5-3.3-2.5-5.5Z" />
  </svg>
)

export const ChartIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 19V5M4 19h16" />
    <path d="m7 14 3.5-4 3 2.5L18.5 7" />
  </svg>
)

export const GearIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
  </svg>
)

export const SwapIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M16 3.5 20 7.5l-4 4M20 7.5H7M8 20.5l-4-4 4-4M4 16.5h13" />
  </svg>
)

export const ChevronIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const BackIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
)
