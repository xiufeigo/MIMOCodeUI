import { createContext, createEffect, createSignal, useContext, type Accessor, type ParentProps } from "solid-js"
import { useApp } from "./store/provider"

const SESSION_ARCHIVE_KEY = "mimocode-ui.session-archive.v1"

/** 归档状态：会话 id 集合 + 目录 key 集合（按 profile 隔离）。 */
interface ArchiveStore {
  sessions: Record<string, true>
  directories: Record<string, true>
}

interface SessionArchiveContextValue {
  archive: Accessor<ArchiveStore>
  /** 会话「已归档」= 自身被归档，或所在目录被归档。 */
  isArchived: (sessionID: string, directory?: string) => boolean
  isDirectoryArchived: (directory?: string) => boolean
  toggleSession: (sessionID: string) => void
  toggleDirectory: (directory?: string) => void
}

const SessionArchiveContext = createContext<SessionArchiveContextValue>()

function loadArchive(): ArchiveStore {
  try {
    const raw = localStorage.getItem(SESSION_ARCHIVE_KEY)
    if (!raw) return { sessions: {}, directories: {} }
    const parsed = JSON.parse(raw) as Partial<ArchiveStore>
    return {
      sessions: parsed.sessions ?? {},
      directories: parsed.directories ?? {},
    }
  } catch {
    return { sessions: {}, directories: {} }
  }
}

/**
 * 会话归档（纯前端）：归档只在本地隐藏会话，不影响服务端数据。
 * 目录归档后，该目录下新创建的任务也不会在任务列表显示。
 */
export function SessionArchiveProvider(props: ParentProps) {
  const { activeProfile } = useApp()
  const [archive, setArchive] = createSignal<ArchiveStore>(loadArchive())

  const keyForSession = (sessionID: string) => `${activeProfile().id}:${sessionID}`
  const keyForDirectory = (directory?: string) => `${activeProfile().id}:${directory ?? ""}`

  createEffect(() => {
    try {
      localStorage.setItem(SESSION_ARCHIVE_KEY, JSON.stringify(archive()))
    } catch {
      // 私密模式或存储配额异常时保留当前会话内状态。
    }
  })

  function toggleSession(sessionID: string) {
    const key = keyForSession(sessionID)
    setArchive((previous) => {
      const sessions = { ...previous.sessions }
      if (sessions[key]) delete sessions[key]
      else sessions[key] = true
      return { ...previous, sessions }
    })
  }

  function toggleDirectory(directory?: string) {
    const key = keyForDirectory(directory)
    setArchive((previous) => {
      const directories = { ...previous.directories }
      if (directories[key]) delete directories[key]
      else directories[key] = true
      return { ...previous, directories }
    })
  }

  const isDirectoryArchived = (directory?: string) => archive().directories[keyForDirectory(directory)] === true

  const value: SessionArchiveContextValue = {
    archive,
    isArchived(sessionID, directory) {
      return archive().sessions[keyForSession(sessionID)] === true || isDirectoryArchived(directory)
    },
    isDirectoryArchived,
    toggleSession,
    toggleDirectory,
  }

  return <SessionArchiveContext.Provider value={value}>{props.children}</SessionArchiveContext.Provider>
}

export function useSessionArchive(): SessionArchiveContextValue {
  const context = useContext(SessionArchiveContext)
  if (!context) throw new Error("useSessionArchive must be used within SessionArchiveProvider")
  return context
}
