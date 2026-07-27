/**
 * The two-tone "time's up" chime, shared by the rest timer and the cool-down
 * runner so a finished interval sounds the same wherever you are in the app.
 * Synthesised rather than shipped as an audio file — this is an offline-first
 * PWA and a sound that has to be fetched is a sound that can fail.
 */
export function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const play = (freq: number, at: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.28)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + at)
      osc.stop(ctx.currentTime + at + 0.3)
    }
    play(880, 0)
    play(1174, 0.32)
    setTimeout(() => ctx.close(), 1200)
  } catch {
    // audio unavailable — vibration already covers it
  }
}
