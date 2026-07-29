/**
 * Regenerates every app icon in public/ from the one mark defined below.
 *
 *   node scripts/build-icons.mjs
 *
 * The icons used to be hand-exported, and both PNGs shipped clipped — the
 * 192 had its bottom 45% cut to transparency, so the home screen showed a
 * barbell sliced in half. Generating them from source is what stops that
 * happening again: one mark, one script, five files, all provably square.
 *
 * Rendering goes through Chromium (via playwright-core) rather than an SVG
 * rasteriser library so gradients and radii land exactly as a browser draws
 * them — the same engine that renders the favicon.
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/* Palette lifted from src/styles/global.css so the icon sits in the app's
   warm neutral ramp instead of the cool near-black it used before. */
const BG_HI = '#1c1917'
const BG_LO = '#0a0908'
const EDGE = 'rgba(255, 246, 240, 0.10)' // --line, the machined hairline

/* ── The mark ──────────────────────────────────────────────────────────
   A loaded bar, dead-on, on a 64 grid centred at (32, 32).

   Every element is mirrored about x=32 and the whole thing spans y 16–48,
   so the mark is optically centred in both axes — the old one sat 1px
   high and its plates ran to the tile edge.

   The vertical gradients are doing one job: a horizontal bar shaded light
   over dark reads as a cylinder rather than a stripe. At 48px that survives
   only as a slight warmth, which is the point — detail that dissolves
   cleanly is detail worth having.

   The sizes carry a deliberate hierarchy — 8-unit inner plates against
   5.5-unit outer ones, with an 11-unit grip down the middle. The old mark
   had four near-identical 6–7 unit bars spaced 3 apart, which at a 48px
   launcher tile is 4.5px bars in 2px gaps: they alias into one grey block.
   Widening the grip and splitting the plate sizes is what makes this read
   as a loaded bar rather than a picket fence when it's small. */
const MARK = `
  <rect x="4" y="29.5" width="56" height="5" rx="2.5" fill="url(#bar)"/>
  <rect x="9.5" y="23" width="5.5" height="18" rx="2.75" fill="url(#small)"/>
  <rect x="49" y="23" width="5.5" height="18" rx="2.75" fill="url(#small)"/>
  <rect x="18.5" y="15" width="8" height="34" rx="3" fill="url(#big)"/>
  <rect x="37.5" y="15" width="8" height="34" rx="3" fill="url(#big)"/>`

const DEFS = `
    <linearGradient id="tile" x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BG_HI}"/><stop offset="1" stop-color="${BG_LO}"/>
    </linearGradient>
    <linearGradient id="bar" x1="32" y1="29.5" x2="32" y2="34.5" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff9166"/><stop offset="1" stop-color="#e2551f"/>
    </linearGradient>
    <linearGradient id="small" x1="32" y1="23" x2="32" y2="41" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff8352"/><stop offset="1" stop-color="#d94814"/>
    </linearGradient>
    <linearGradient id="big" x1="32" y1="15" x2="32" y2="49" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fffdfb"/><stop offset="1" stop-color="#cec7c1"/>
    </linearGradient>`

/**
 * @param {object} opts
 * @param {number} opts.radius  corner radius on the 64 grid; 0 = full bleed
 * @param {number} opts.scale   shrink factor applied to the mark about centre
 * @param {boolean} opts.edge   draw the hairline rim
 */
function svg({ radius = 14, scale = 1, edge = true } = {}) {
  const t = scale === 1 ? '' : ` transform="translate(32 32) scale(${scale}) translate(-32 -32)"`
  const rim = edge
    ? `\n  <rect x=".5" y=".5" width="63" height="63" rx="${radius - 0.5}" fill="none" stroke="${EDGE}"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Forge">
  <defs>${DEFS}
  </defs>
  <rect width="64" height="64" rx="${radius}" fill="url(#tile)"/>${rim}
  <g${t}>${MARK}
  </g>
</svg>
`
}

/* Android crops a maskable icon to whatever shape the launcher likes and
   only guarantees the centre circle of radius 40% — 25.6 units here. The
   old icon was declared maskable at full bleed, so a launcher using a
   circle mask sheared the ends off the bar. The mark's far corner sits
   hypot(28, 17) = 32.8 units out, so it has to come in: 0.74 puts it at
   24.3, inside the circle with a little margin for a tighter mask. */
const SAFE_ZONE_SCALE = 0.74

const sources = {
  'icon.svg': svg(),
  'icon-maskable.svg': svg({ radius: 0, scale: SAFE_ZONE_SCALE, edge: false }),
}

/* apple-touch-icon is never given transparency to work with: iOS composites
   it onto white and applies its own superellipse, so it ships full-bleed,
   square and opaque. 180 is the size current iPhones ask for. */
const targets = [
  { file: 'icon-192.png', source: 'icon.svg', size: 192, opaque: false },
  { file: 'icon-512.png', source: 'icon.svg', size: 512, opaque: false },
  { file: 'icon-maskable-512.png', source: 'icon-maskable.svg', size: 512, opaque: true },
  { file: 'apple-touch-icon.png', source: null, size: 180, opaque: true },
]

const appleTouch = svg({ radius: 0, edge: false })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})

try {
  await mkdir(PUBLIC, { recursive: true })
  for (const [name, markup] of Object.entries(sources)) {
    await writeFile(join(PUBLIC, name), markup)
    console.log(`wrote public/${name}`)
  }

  for (const { file, source, size, opaque } of targets) {
    const markup = source ? sources[source] : appleTouch
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    await page.setContent(
      `<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
    )
    const buf = await page.locator('svg').screenshot({ omitBackground: !opaque })
    await page.close()
    await writeFile(join(PUBLIC, file), buf)
    console.log(`wrote public/${file} (${size}x${size})`)
  }
} finally {
  await browser.close()
}
