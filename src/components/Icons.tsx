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

export const HistoryIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5V9h4.5" />
    <path d="M12 8v4l3 2" />
  </svg>
)

export const TrashIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" />
  </svg>
)

export const CloseIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const LinkIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M9 12h6" />
    <path d="M10.5 8H8a4 4 0 0 0 0 8h2.5M13.5 8H16a4 4 0 0 1 0 8h-2.5" />
  </svg>
)

export const CheckIcon = ({ size = 13 }: IconProps) => (
  <svg {...base(size)} strokeWidth={3}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
)

export const AlertIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 9v4.5M12 17h.01" />
    <path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3.1L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </svg>
)

export const TrophyIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 5.5H4.5v1A3.5 3.5 0 0 0 7.6 10M17 5.5h2.5v1A3.5 3.5 0 0 1 16.4 10" />
    <path d="M12 14v3M9 20h6M10 20c0-1.7.9-3 2-3s2 1.3 2 3" />
  </svg>
)

/** Right-pointing caret used for disclosure rows; rotates when open. */
export const CaretIcon = ({ size = 12 }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.6}>
    <path d="m9 5 7 7-7 7" />
  </svg>
)

export const BookIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 5.5A2 2 0 0 1 6 3.5h13v15H6a2 2 0 0 0-2 2Z" />
    <path d="M4 5.5v15" />
  </svg>
)

export const SparkIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M13.5 2.5 5 13.5h5.5L9.5 21.5 18.5 10h-5.5l.5-7.5Z" />
  </svg>
)
