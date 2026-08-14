// Settings store: mirrors the OpenCode desktop settings model (General /
// Models / Providers / Servers / Shortcuts). UI-level settings persist to
// localStorage; server-side config (shell, providers…) goes through the
// /global/config API from the client.

import { createContext, createEffect, createSignal, useContext, onCleanup, type ParentProps, type Accessor } from "solid-js"
import { THEMES, DEFAULT_THEME_ID, type ThemeDef } from "../theme/themes"
import { applyTheme, watchSystemScheme, type ColorScheme } from "../theme/apply"

export const SETTINGS_KEY = "mimocode-ui.settings"

export interface SettingsState {
  colorScheme: ColorScheme
  themeId: string
  fonts: { sans: string; mono: string; terminal: string; fontSize: number }
  notifications: { agent: boolean; permissions: boolean; errors: boolean }
  permissions: { autoAccept: boolean }
  sounds: { agent: string; permissions: string; errors: string }
  language: string
  advanced: {
    showFileTree: boolean
    showNavigation: boolean
    showSearch: boolean
    showStatus: boolean
    showCustomAgents: boolean
  }
  reasoningSummaries: boolean
  shellToolPartsExpanded: boolean
  editToolPartsExpanded: boolean
  keybinds: Record<string, string>
  modelVisibility: Record<string, "show" | "hide">
  layout: { leftSidebarWidth: number; rightSidebarWidth: number }
}

const DEFAULTS: SettingsState = {
  colorScheme: "system",
  themeId: DEFAULT_THEME_ID,
  fonts: { sans: "", mono: "", terminal: "", fontSize: 16 },
  notifications: { agent: true, permissions: true, errors: true },
  permissions: { autoAccept: false },
  sounds: { agent: "default", permissions: "default", errors: "default" },
  language: "zh-CN",
  advanced: {
    showFileTree: true,
    showNavigation: true,
    showSearch: true,
    showStatus: true,
    showCustomAgents: true,
  },
  reasoningSummaries: true,
  shellToolPartsExpanded: false,
  editToolPartsExpanded: false,
  keybinds: {},
  modelVisibility: {},
  layout: { leftSidebarWidth: 240, rightSidebarWidth: 384 },
}

  function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<SettingsState>
    return {
      ...DEFAULTS,
      ...parsed,
      fonts: { ...DEFAULTS.fonts, ...parsed.fonts },
      notifications: { ...DEFAULTS.notifications, ...parsed.notifications },
      permissions: { ...DEFAULTS.permissions, ...parsed.permissions },
      sounds: { ...DEFAULTS.sounds, ...parsed.sounds },
      advanced: { ...DEFAULTS.advanced, ...parsed.advanced },
      layout: { ...DEFAULTS.layout, ...parsed.layout },
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function themeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export function findTheme(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

const SettingsContext = createContext<{
  settings: Accessor<SettingsState>
  set<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void
  patch(p: Partial<SettingsState>): void
  setFont(kind: "sans" | "mono" | "terminal", value: string): void
  setFontSize(value: number): void
  setNotification(kind: keyof SettingsState["notifications"], value: boolean): void
  setSound(kind: keyof SettingsState["sounds"], value: string): void
  setAutoAccept(value: boolean): void
  setAdvanced(key: keyof SettingsState["advanced"], value: boolean): void
  setKeybind(command: string, combo: string): void
  clearKeybind(command: string): void
  toggleModelVisibility(key: string): void
  setModelVisibility(key: string, visible: boolean): void
  setModelsVisibility(keys: string[], visible: boolean): void
  isModelVisible(key: string): boolean
  setLayoutWidth(side: "left" | "right", value: number): void
}>()

export function SettingsProvider(props: ParentProps) {
  const [settings, setSettings] = createSignal<SettingsState>(loadSettings())
  const theme = () => themeById(settings().themeId)

  function persist(next: SettingsState) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    } catch {
      // ignore (private mode)
    }
  }

  const set = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) =>
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      persist(next)
      return next
    })

  const patch = (p: Partial<SettingsState>) =>
    setSettings((prev) => {
      const next = { ...prev, ...p }
      persist(next)
      return next
    })

  const setFont = (kind: "sans" | "mono" | "terminal", value: string) =>
    setSettings((prev) => {
      const next = { ...prev, fonts: { ...prev.fonts, [kind]: value } }
      persist(next)
      return next
    })

  const setFontSize = (value: number) =>
    setSettings((prev) => {
      const next = { ...prev, fonts: { ...prev.fonts, fontSize: value } }
      persist(next)
      return next
    })

  const setNotification = (kind: keyof SettingsState["notifications"], value: boolean) =>
    setSettings((prev) => {
      const next = { ...prev, notifications: { ...prev.notifications, [kind]: value } }
      persist(next)
      return next
    })

  const setSound = (kind: keyof SettingsState["sounds"], value: string) =>
    setSettings((prev) => {
      const next = { ...prev, sounds: { ...prev.sounds, [kind]: value } }
      persist(next)
      return next
    })

  const setAutoAccept = (value: boolean) =>
    setSettings((prev) => {
      const next = { ...prev, permissions: { ...prev.permissions, autoAccept: value } }
      persist(next)
      return next
    })

  const setAdvanced = (key: keyof SettingsState["advanced"], value: boolean) =>
    setSettings((prev) => {
      const next = { ...prev, advanced: { ...prev.advanced, [key]: value } }
      persist(next)
      return next
    })

  const setKeybind = (command: string, combo: string) =>
    setSettings((prev) => {
      const next = { ...prev, keybinds: { ...prev.keybinds, [command]: combo } }
      persist(next)
      return next
    })

  const clearKeybind = (command: string) =>
    setSettings((prev) => {
      const kb = { ...prev.keybinds }
      delete kb[command]
      const next = { ...prev, keybinds: kb }
      persist(next)
      return next
    })

  const toggleModelVisibility = (key: string) =>
    setSettings((prev) => {
      const cur: "show" | "hide" = prev.modelVisibility[key] ?? "show"
      const nextVal: "show" | "hide" = cur === "show" ? "hide" : "show"
      const next = { ...prev, modelVisibility: { ...prev.modelVisibility, [key]: nextVal } }
      persist(next)
      return next
    })

  const setModelVisibility = (key: string, visible: boolean) =>
    setSettings((prev) => {
      const nextVal: "show" | "hide" = visible ? "show" : "hide"
      const next = { ...prev, modelVisibility: { ...prev.modelVisibility, [key]: nextVal } }
      persist(next)
      return next
    })

  const setModelsVisibility = (keys: string[], visible: boolean) =>
    setSettings((prev) => {
      const nextVal: "show" | "hide" = visible ? "show" : "hide"
      const updates: Record<string, "show" | "hide"> = {}
      for (const key of keys) updates[key] = nextVal
      const next = { ...prev, modelVisibility: { ...prev.modelVisibility, ...updates } }
      persist(next)
      return next
    })

  const isModelVisible = (key: string) => (settings().modelVisibility[key] ?? "show") === "show"

  const setLayoutWidth = (side: "left" | "right", value: number) =>
    setSettings((prev) => {
      const next = { ...prev, layout: { ...prev.layout, [side === "left" ? "leftSidebarWidth" : "rightSidebarWidth"]: value } }
      persist(next)
      return next
    })

  // Apply theme + scheme + fonts reactively.
  let stopWatching: (() => void) | null = null
  createEffect(() => {
    const t = theme()
    const scheme = settings().colorScheme
    applyTheme(t, scheme)
    stopWatching?.()
    stopWatching = watchSystemScheme(t, scheme)
  })

  createEffect(() => {
    const root = document.documentElement
    const f = settings().fonts
    root.style.setProperty("--font-sans", f.sans || "system-ui, -apple-system, sans-serif")
    root.style.setProperty("--font-mono", f.mono || "Consolas, 'Courier New', monospace")
    root.style.setProperty("--font-terminal", f.terminal || "Consolas, 'Courier New', monospace")
    root.style.fontSize = `${f.fontSize}px`
  })

  onCleanup(() => stopWatching?.())

  return (
    <SettingsContext.Provider
      value={{
        settings,
        set,
        patch,
        setFont,
        setFontSize,
        setNotification,
        setSound,
        setAutoAccept,
        setAdvanced,
        setKeybind,
        clearKeybind,
        toggleModelVisibility,
        setModelVisibility,
        setModelsVisibility,
        isModelVisible,
        setLayoutWidth,
      }}
    >
      {props.children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider")
  return ctx
}
