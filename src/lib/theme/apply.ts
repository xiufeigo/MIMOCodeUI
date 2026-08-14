import type { ThemeDef } from "./themes"

export type ColorScheme = "system" | "light" | "dark"

export function resolveScheme(scheme: ColorScheme): "light" | "dark" {
  if (scheme !== "system") return scheme
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark"
}

const STYLE_ID = "mimo-theme"

/** Map the theme palette to our semantic tokens (dark defaults). */
function semanticVars(vars: Record<string, string>, mode: "light" | "dark"): Record<string, string> {
  const dark = mode === "dark"
  const neutral = vars["neutral"] || (dark ? "#1a1a1a" : "#f7f7f7")
  const ink = vars["ink"] || (dark ? "#e5e5e5" : "#171311")
  const primary = vars["primary"] || "#818cf8"
  const success = vars["success"] || "#4ade80"
  const warning = vars["warning"] || "#fbbf24"
  const error = vars["error"] || "#f87171"

  // 优先使用主题直接提供的 surface/border/text 键，缺失时退回中性色推导。
  const surfaceBase = vars["surface-base"]
  const raisedBase = vars["surface-raised-base"]
  const raisedHover = vars["surface-raised-base-hover"]
  const textStrong = vars["text-strong"]
  const textBase = vars["text-base"]
  const textWeak = vars["text-weak"]
  const textWeaker = vars["text-weaker"]
  const borderWeak = vars["border-weak-base"]
  const borderWeaker = vars["border-weaker-base"]

  return {
    "--bg-app": neutral,
    "--bg-panel": surfaceBase ?? shade(neutral, dark ? 4 : -4),
    "--bg-surface": raisedBase ?? shade(neutral, dark ? 6 : -6),
    "--bg-hover": raisedHover ?? shade(neutral, dark ? 10 : -10),
    "--bg-input": shade(neutral, dark ? 3 : -3),
    "--bg-raised": raisedBase ?? shade(neutral, dark ? 8 : -8),
    "--text-primary": textStrong ?? ink,
    "--text-secondary": textBase ?? textWeak ?? mix(ink, neutral, dark ? 0.4 : 0.35),
    "--text-muted": textWeaker ?? mix(ink, neutral, dark ? 0.62 : 0.55),
    "--border-color": borderWeak ?? shade(neutral, dark ? 12 : -12),
    "--border-strong": borderWeaker ?? shade(neutral, dark ? 18 : -18),
    "--accent": primary,
    "--accent-secondary": vars["accent"] ?? primary,
    "--interactive": vars["interactive"] ?? primary,
    "--success": success,
    "--warning": warning,
    "--error": error,
    "--info": vars["info"] ?? "#a753ae",
    "--diff-add": vars["diffAdd"] ?? success,
    "--diff-delete": vars["diffDelete"] ?? error,
  }
}

/** Blend two hex colors by ratio (0 = c1, 1 = c2). */
function mix(c1: string, c2: string, ratio: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const a = p(c1)
  const b = p(c2)
  const ch = a.map((v, i) => Math.round(v + (b[i] - v) * ratio))
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

/** Lighten (positive) or darken (negative) a hex color by percentage steps. */
function shade(hex: string, delta: number): string {
  const p = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const ch = p.map((v) => Math.max(0, Math.min(255, v + delta)))
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

/** Inject a theme's CSS variables into :root (OpenCode-style: palette <
 * v2Overrides < overrides were already merged in the transpiled map). */
export function applyTheme(theme: ThemeDef, scheme: ColorScheme) {
  const mode = resolveScheme(scheme)
  const vars = { ...semanticVars(theme[mode] ?? {}, mode), ...(theme[mode] ?? {}) }
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  const css = Object.entries(vars)
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .map(([k, v]) => `${k.startsWith("--") ? k : `--${k}`}:${v}`)
    .join(";")
  style.textContent = `:root{${css}}`
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.dataset.colorScheme = mode
  // Keep Tailwind's color-scheme in sync so scrollbars/inputs follow.
  root.style.colorScheme = mode
}

/** Re-apply the current theme when the OS scheme changes (system mode). */
export function watchSystemScheme(theme: ThemeDef, scheme: ColorScheme) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const mq = window.matchMedia("(prefers-color-scheme: light)")
  const onChange = () => {
    if (scheme === "system") applyTheme(theme, scheme)
  }
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}
