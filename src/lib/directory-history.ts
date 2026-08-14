import { createSignal } from "solid-js"

const DIRECTORY_HISTORY_KEY = "mimocode-ui.directory-history.v1"
const MAX_RECENT_DIRECTORIES = 8

type DirectoryHistory = Record<string, string[]>

function loadDirectoryHistory(): DirectoryHistory {
  try {
    const raw = localStorage.getItem(DIRECTORY_HISTORY_KEY)
    return raw ? (JSON.parse(raw) as DirectoryHistory) : {}
  } catch {
    return {}
  }
}

function persistDirectoryHistory(history: DirectoryHistory) {
  try {
    localStorage.setItem(DIRECTORY_HISTORY_KEY, JSON.stringify(history))
  } catch {
    // Keep the in-memory history when browser storage is unavailable.
  }
}

const [directoryHistory, setDirectoryHistory] = createSignal<DirectoryHistory>(loadDirectoryHistory())

export function recentDirectories(profileID: string): string[] {
  return directoryHistory()[profileID] ?? []
}

export function rememberDirectory(profileID: string, directory: string) {
  const normalized = directory.trim()
  if (!normalized) return
  setDirectoryHistory((previous) => {
    const next = { ...previous }
    next[profileID] = [normalized, ...(previous[profileID] ?? []).filter((item) => item !== normalized)].slice(
      0,
      MAX_RECENT_DIRECTORIES,
    )
    persistDirectoryHistory(next)
    return next
  })
}
