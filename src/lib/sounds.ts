// 轻量提示音：用 WebAudio 合成，避免引入外部音频资源。
// 声音类型对应设置里的 sounds.* 选项：none / default / crisp / soft。

let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, duration: number, type: OscillatorType, gain: number, when = 0) {
  const ac = audioContext()
  if (!ac) return
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.value = gain
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + when + duration)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(ac.currentTime + when)
  osc.stop(ac.currentTime + when + duration)
}

/** 播放指定音色（none 静音）。 */
export function playSound(kind: string): void {
  if (!kind || kind === "none") return
  if (kind === "crisp") {
    tone(880, 0.12, "sine", 0.05)
    return
  }
  if (kind === "soft") {
    tone(520, 0.2, "sine", 0.03)
    tone(660, 0.2, "sine", 0.02, 0.08)
    return
  }
  // default
  tone(660, 0.15, "triangle", 0.04)
}
