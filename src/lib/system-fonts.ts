// System font enumeration for the settings "字体" picker.
//
// The desktop (Tauri) build enumerates installed fonts via the Rust
// `list_system_fonts` command. Browser dev preview falls back to the Chromium
// Local Font Access API, then to a curated list of common families, so the
// picker is still usable without the native shell.

const FALLBACK_FONTS = [
  "system-ui",
  "Inter",
  "Roboto",
  "Helvetica Neue",
  "Arial",
  "Segoe UI",
  "SF Pro Text",
  "PingFang SC",
  "Microsoft YaHei",
  "Noto Sans SC",
  "Source Han Sans SC",
  "Consolas",
  "JetBrains Mono",
  "Fira Code",
  "SF Mono",
  "Menlo",
  "Monaco",
  "Courier New",
  "Cascadia Code",
  "Ubuntu Mono",
]

export async function listSystemFonts(): Promise<string[]> {
  // 1) Tauri desktop — the native command returns clean family names.
  try {
    const mod = await import("@tauri-apps/api/core")
    if (typeof mod.invoke === "function") {
      const fonts = await mod.invoke<string[]>("list_system_fonts")
      if (Array.isArray(fonts) && fonts.length > 0) return fonts
    }
  } catch {
    // not running under Tauri (or command unavailable)
  }

  // 2) Chromium Local Font Access API (browser dev preview).
  try {
    const w = window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }
    if (typeof w.queryLocalFonts === "function") {
      const fonts = await w.queryLocalFonts()
      const names = Array.from(new Set(fonts.map((f) => f.family).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      )
      if (names.length > 0) return names
    }
  } catch {
    // permission denied or unsupported
  }

  return FALLBACK_FONTS
}
