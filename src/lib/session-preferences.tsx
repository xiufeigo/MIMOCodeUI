import { createContext, createEffect, createSignal, useContext, type Accessor, type ParentProps } from "solid-js"
import { useApp } from "./store/provider"

const SESSION_PREFERENCES_KEY = "mimocode-ui.session-preferences.v1"

export interface SessionPreference {
  pinned?: boolean
  customTitle?: string
}

interface SessionPreferencesContextValue {
  preferences: Accessor<Record<string, SessionPreference>>
  displayTitle: (sessionID: string, serverTitle?: string) => string
  isPinned: (sessionID: string) => boolean
  rename: (sessionID: string, title: string) => void
  togglePinned: (sessionID: string) => void
  sortSessionIDs: (sessionIDs: string[]) => string[]
}

const SessionPreferencesContext = createContext<SessionPreferencesContextValue>()

function loadPreferences(): Record<string, SessionPreference> {
  try {
    const raw = localStorage.getItem(SESSION_PREFERENCES_KEY)
    return raw ? (JSON.parse(raw) as Record<string, SessionPreference>) : {}
  } catch {
    return {}
  }
}

/** 会话展示偏好仅保存在当前设备：置顶和自定义标题不改变服务端会话数据。 */
export function SessionPreferencesProvider(props: ParentProps) {
  const { activeProfile } = useApp()
  const [preferences, setPreferences] = createSignal<Record<string, SessionPreference>>(loadPreferences())

  const keyFor = (sessionID: string) => `${activeProfile().id}:${sessionID}`
  const preferenceFor = (sessionID: string) => preferences()[keyFor(sessionID)] ?? preferences()[sessionID]

  createEffect(() => {
    try {
      localStorage.setItem(SESSION_PREFERENCES_KEY, JSON.stringify(preferences()))
    } catch {
      // 私密模式或存储配额异常时保留当前会话内状态。
    }
  })

  function update(sessionID: string, next: SessionPreference) {
    const key = keyFor(sessionID)
    setPreferences((previous) => {
      const entries = { ...previous }
      if (!next.pinned && !next.customTitle) delete entries[key]
      else entries[key] = next
      return entries
    })
  }

  const value: SessionPreferencesContextValue = {
    preferences,
    displayTitle(sessionID, serverTitle) {
      return preferenceFor(sessionID)?.customTitle || serverTitle || "无标题会话"
    },
    isPinned(sessionID) {
      return preferenceFor(sessionID)?.pinned === true
    },
    rename(sessionID, title) {
      const trimmed = title.trim()
      update(sessionID, { ...preferences()[keyFor(sessionID)], customTitle: trimmed || undefined })
    },
    togglePinned(sessionID) {
      const current = preferences()[keyFor(sessionID)] ?? {}
      update(sessionID, { ...current, pinned: !current.pinned })
    },
    sortSessionIDs(sessionIDs) {
      const pinned: string[] = []
      const regular: string[] = []
      for (const id of sessionIDs) (preferenceFor(id)?.pinned ? pinned : regular).push(id)
      return [...pinned, ...regular]
    },
  }

  return <SessionPreferencesContext.Provider value={value}>{props.children}</SessionPreferencesContext.Provider>
}

export function useSessionPreferences(): SessionPreferencesContextValue {
  const context = useContext(SessionPreferencesContext)
  if (!context) throw new Error("useSessionPreferences must be used within SessionPreferencesProvider")
  return context
}
