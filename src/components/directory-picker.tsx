import { createEffect, createSignal, For, Show, type Component } from "solid-js"
import { open } from "@tauri-apps/plugin-dialog"
import { Check, ChevronDown, ChevronUp, Folder, FolderOpen, HardDrive, Server, X } from "lucide-solid"
import { ModalDialog } from "./overlay/modal-dialog"
import { PopoverSurface } from "./overlay/popover-surface"
import {
  authorizeLocalDirectory,
  completeLocalDirectories,
  isLocalDirectoryProfile,
  listLocalDirectories,
  type DirectoryEntry,
  type DirectoryListing,
} from "../lib/directory-access"
import { recentDirectories } from "../lib/directory-history"
import { useApp, useClient } from "../lib/store/provider"
import type { ServerProfile } from "../lib/server-profiles"

interface DirectoryPickerProps {
  profile: ServerProfile
  value?: string
  /** 外部预填目录（左栏“在目录中新建”），仅在挂载时应用一次。 */
  initialDirectory?: string
  /** 触发器占位文字（无目录时显示）。 */
  placeholder?: string
  /** 触发器只显示目录最后一段（左栏等紧凑场景）。 */
  showBasename?: boolean
  /** 受控打开状态：由父级保证与其它下拉互斥。 */
  open?: boolean
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onChange: (directory: string | undefined) => void
}

/** 路径最后一段（兼容 / 与 \）。 */
function pathBasename(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/)
  return parts[parts.length - 1] || path
}

const isTauriEnv = () =>
  typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined"

/** 目录选择能力：本地 profile 使用 Tauri 原生对话框 + 授权目录浏览；云端列出该服务器已知目录。 */
export const DirectoryPicker: Component<DirectoryPickerProps> = (p) => {
  const { store } = useApp()
  const [browseOpen, setBrowseOpen] = createSignal(false)
  const [remoteOpen, setRemoteOpen] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [triggerEl, setTriggerEl] = createSignal<HTMLElement | null>(null)
  const recent = () => recentDirectories(p.profile.id)
  const local = () => isLocalDirectoryProfile(p.profile) && isTauriEnv()

  let appliedInitial = false
  createEffect(() => {
    if (appliedInitial) return
    const value = p.initialDirectory
    if (value) {
      appliedInitial = true
      p.onChange(value)
    }
  })

  async function selectLocalRecent(directory: string) {
    if (p.disabled) return
    try {
      // 历史路径必须先处于已授权根内；未授权则回到系统对话框确认。
      await listLocalDirectories(directory)
      p.onChange(directory)
      setError(null)
      p.onOpenChange(false)
    } catch {
      await browseNative(directory)
    }
  }

  async function browseNative(defaultPath?: string) {
    if (!local() || p.disabled) return
    try {
      const selected = await open({ directory: true, multiple: false, title: "选择任务文件夹", defaultPath })
      if (typeof selected === "string") {
        const listing = await authorizeLocalDirectory(selected)
        p.onChange(listing.path)
        setError(null)
      }
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      p.onOpenChange(false)
    }
  }

  function selectRemote(directory: string) {
    if (p.disabled) return
    p.onChange(directory)
    setError(null)
    setRemoteOpen(false)
    p.onOpenChange(false)
  }

  /** 该服务器已知的项目目录（本地 store 只保留当前活动服务器的会话）。 */
  const knownRemoteDirectories = () => {
    const known = new Set<string>()
    for (const session of Object.values(store.store.sessions)) {
      if (session.directory) known.add(session.directory)
    }
    for (const dir of recent()) known.add(dir)
    return [...known].sort((a, b) => a.localeCompare(b))
  }

  return (
    <div class="relative min-w-0">
      <button
        ref={setTriggerEl}
        class="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        aria-expanded={p.open === true}
        aria-haspopup="menu"
        disabled={p.disabled}
        onClick={() => p.onOpenChange(p.open !== true)}
      >
        <FolderOpen size={14} class="shrink-0" />
        <span class="max-w-40 truncate">
          {p.value
            ? p.showBasename
              ? pathBasename(p.value)
              : p.value
            : (p.placeholder ?? (local() ? "选择文件夹（可选）" : "选择目录（可选）"))}
        </span>
        <ChevronDown size={13} class="shrink-0" />
      </button>

      <PopoverSurface open={p.open === true} reference={triggerEl()} width={288} onClose={() => p.onOpenChange(false)}>
        <Show when={recent().length > 0}>
          <p class="px-3 py-1.5 text-[10px] font-medium text-[var(--text-muted)]">最近使用</p>
          <For each={recent()}>
            {(directory) => (
              <button class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50" disabled={p.disabled} onClick={() => void (local() ? selectLocalRecent(directory) : selectRemote(directory))}>
                <Folder size={15} class="shrink-0 text-[var(--text-muted)]" />
                <span class="truncate text-xs text-[var(--text-secondary)]">{directory}</span>
              </button>
            )}
          </For>
          <div class="my-1 border-t border-[var(--border-color)]" />
        </Show>
        <Show when={local()} fallback={<RemotePickerAction onClick={() => setRemoteOpen(true)} disabled={p.disabled} />}>
          <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50" disabled={p.disabled} onClick={() => setBrowseOpen(true)}>
            <FolderOpen size={16} />
            选择文件夹
          </button>
        </Show>
        <Show when={p.value}>
          <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]" disabled={p.disabled} onClick={() => p.onChange(undefined)}>
            <X size={16} />
            清除目录
          </button>
        </Show>
      </PopoverSurface>

      <Show when={error()}>
        <p class="fixed z-40 rounded-md bg-[var(--bg-surface)] px-2 py-1 text-[10px] text-[var(--error)] shadow-lg">{error()}</p>
      </Show>

      <Show when={local()}>
        <DirectoryPickerDialog
          open={browseOpen()}
          initialPath={p.value}
          onClose={() => setBrowseOpen(false)}
          onSelect={(directory) => {
            setError(null)
            p.onChange(directory)
            setBrowseOpen(false)
          }}
          onError={setError}
        />
      </Show>
      <RemoteDirectoryDialog
        open={remoteOpen() && !local()}
        directories={knownRemoteDirectories()}
        value={p.value}
        onClose={() => setRemoteOpen(false)}
        onSelect={selectRemote}
      />
    </div>
  )
}

const RemotePickerAction: Component<{ onClick: () => void; disabled?: boolean }> = (p) => (
  <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50" disabled={p.disabled} onClick={p.onClick}>
    <Server size={16} />
    从服务器目录中选择…
  </button>
)

interface RemoteDirectoryDialogProps {
  open: boolean
  directories: string[]
  value?: string
  onClose: () => void
  onSelect: (directory: string) => void
}

/** 云端目录选择：列出该服务器已知的工作目录，自定义路径支持实时补全。 */
const RemoteDirectoryDialog: Component<RemoteDirectoryDialogProps> = (p) => {
  const client = useClient()
  const [path, setPath] = createSignal("")
  const [completions, setCompletions] = createSignal<{ name: string; path: string }[]>([])

  createEffect(() => {
    if (p.open) setPath(p.value ?? "")
  })

  // 输入实时补全：已知目录前缀匹配 + 服务端相对路径（工作区根内）目录列举。
  createEffect(() => {
    const value = path().trim()
    if (!p.open || !value) {
      setCompletions([])
      return
    }
    const timer = setTimeout(() => {
      void refreshCompletions(value)
    }, 180)
    return () => clearTimeout(timer)
  })

  async function refreshCompletions(value: string) {
    const c = client()
    const known = p.directories
      .filter((directory) => directory.toLowerCase().startsWith(value.toLowerCase()))
      .slice(0, 12)
      .map((directory) => ({ name: pathBasename(directory), path: directory }))
    let server: { name: string; path: string }[] = []
    // 绝对路径（/ 开头或盘符）无法在服务端列出（目录 fence）→ 仅已知目录匹配；
    // 相对路径尝试在服务端工作区根下列出子目录（mimo/opencode 的 /file）。
    const isAbsolute = value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value)
    if (!isAbsolute && c) {
      try {
        const entries = await c.listFiles(value)
        server = entries
          .filter((entry) => entry.isDirectory || entry.type === "directory")
          .slice(0, 12)
          .map((entry) => ({ name: entry.name, path: entry.path }))
      } catch {
        server = []
      }
    }
    setCompletions([...known, ...server])
  }

  return (
    <ModalDialog open={p.open} title="选择服务器目录" onClose={p.onClose} class="w-full max-w-xl">
      <div class="flex max-h-[calc(100dvh-2rem)] min-h-[20rem] flex-col overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-2xl">
        <div class="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div class="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Server size={17} />
            选择服务器目录
          </div>
          <button class="flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" title="关闭" aria-label="关闭" onClick={p.onClose}>
            <X size={16} />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <p class="mb-2 text-xs text-[var(--text-muted)]">该服务器暂不支持任意目录浏览，已列出本服务器已知的工作目录。</p>
          <Show
            when={p.directories.length > 0}
            fallback={<p class="py-6 text-center text-sm text-[var(--text-muted)]">还没有已知目录，可以在下方输入服务器上的绝对路径。</p>}
          >
            <For each={p.directories}>
              {(directory) => (
                <button class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]" onClick={() => p.onSelect(directory)}>
                  <Folder size={16} class="shrink-0 text-[var(--accent)]" />
                  <span class="min-w-0 truncate">{directory}</span>
                </button>
              )}
            </For>
          </Show>
        </div>
        <div class="flex flex-col gap-2 border-t border-[var(--border-color)] p-3">
          <p class="text-xs text-[var(--text-muted)]">高级：输入服务器路径（绝对路径匹配已知目录；相对路径按工作区根补全）。</p>
          <div class="flex gap-2">
            <input
              class="min-w-0 flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              placeholder="/srv/projects/example"
              value={path()}
              onInput={(event) => setPath(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && path().trim()) p.onSelect(path().trim())
              }}
              aria-label="服务器绝对路径"
            />
            <button class="rounded-md bg-[var(--accent)] px-3 text-sm text-white disabled:opacity-50" disabled={!path().trim()} onClick={() => p.onSelect(path().trim())}>
              使用
            </button>
          </div>
          <Show when={completions().length > 0}>
            <div class="overflow-hidden rounded-md border border-[var(--border-color)] bg-[var(--bg-surface)]">
              <For each={completions()}>
                {(entry) => (
                  <button
                    class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)]"
                    onClick={() => p.onSelect(entry.path)}
                  >
                    <Folder size={14} class="shrink-0 text-[var(--text-muted)]" />
                    <span class="min-w-0 truncate text-[var(--text-secondary)]">{entry.path}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </ModalDialog>
  )
}

interface DirectoryPickerDialogProps {
  open: boolean
  initialPath?: string
  onClose: () => void
  onSelect: (directory: string) => void
  onError: (message: string | null) => void
}

const DirectoryPickerDialog: Component<DirectoryPickerDialogProps> = (p) => {
  const [path, setPath] = createSignal("")
  const [listing, setListing] = createSignal<DirectoryListing | null>(null)
  const [suggestions, setSuggestions] = createSignal<DirectoryEntry[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  let requestID = 0

  createEffect(() => {
    if (!p.open) return
    setPath(p.initialPath ?? "")
    setListing(null)
    setSuggestions([])
    setError(null)
  })

  createEffect(() => {
    const value = path().trim()
    if (!p.open || !value) {
      setSuggestions([])
      return
    }
    const current = ++requestID
    const timer = setTimeout(() => {
      void completeLocalDirectories(value)
        .then((next) => {
          if (current === requestID) setSuggestions(next)
        })
        .catch(() => {
          if (current === requestID) setSuggestions([])
        })
    }, 180)
    return () => clearTimeout(timer)
  })

  async function load(pathValue: string, authorize = false) {
    setLoading(true)
    setError(null)
    try {
      const next = authorize ? await authorizeLocalDirectory(pathValue) : await listLocalDirectories(pathValue)
      setListing(next)
      setPath(next.path)
      setSuggestions([])
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function browseNative() {
    try {
      const selected = await open({ directory: true, multiple: false, title: "选择任务文件夹" })
      if (typeof selected === "string") await load(selected, true)
    } catch (cause) {
      setError((cause as Error).message)
    }
  }

  function selectCurrent() {
    const current = listing()?.path || path().trim()
    if (!current) {
      setError("请先选择文件夹")
      return
    }
    p.onError(null)
    p.onSelect(current)
  }

  return (
    <ModalDialog open={p.open} title="选择文件夹" onClose={p.onClose} class="w-full max-w-2xl">
      <div class="flex max-h-[calc(100dvh-2rem)] min-h-[28rem] flex-col overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-2xl">
        <div class="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div class="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <HardDrive size={17} />
            选择本地文件夹
          </div>
          <button class="flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" title="关闭" aria-label="关闭" onClick={p.onClose}>
            <X size={16} />
          </button>
        </div>
        <div class="border-b border-[var(--border-color)] p-3">
          <div class="flex gap-2">
            <input
              class="min-w-0 flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              placeholder="通过“浏览…”选择文件夹，或输入已授权路径"
              value={path()}
              onInput={(event) => setPath(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void load(path())
              }}
              aria-label="文件夹路径"
            />
            <button class="rounded-md border border-[var(--border-color)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]" onClick={() => void browseNative()}>
              浏览…
            </button>
          </div>
          <Show when={suggestions().length > 0}>
            <div class="mt-1 overflow-hidden rounded-md border border-[var(--border-color)] bg-[var(--bg-surface)]">
              <For each={suggestions()}>
                {(entry) => (
                  <button class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)]" onClick={() => void load(entry.path)}>
                    <Folder size={14} class="text-[var(--text-muted)]" />
                    <span class="truncate text-[var(--text-secondary)]">{entry.path}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={suggestions().length === 0 && path().trim() !== "" && !listing() && !error()}>
            <p class="mt-1 text-xs text-[var(--text-muted)]">无匹配目录，回车或「浏览…」选择</p>
          </Show>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <Show when={error()}>
            <p class="px-2 py-2 text-xs text-[var(--error)]">{error()}</p>
          </Show>
          <Show when={!listing() && !error()}>
            <div class="flex h-full flex-col items-center justify-center gap-3 text-sm text-[var(--text-muted)]">
              <FolderOpen size={28} />
              <p>选择一个文件夹以授予访问权限</p>
            </div>
          </Show>
          <Show when={listing()}>
            {(current) => (
              <>
                <Show when={current().parent}>
                  <button class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]" onClick={() => void load(current().parent!)}>
                    <ChevronUp size={16} />
                    上级目录
                  </button>
                </Show>
                <For each={current().directories}>
                  {(entry) => (
                    <button class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]" onClick={() => void load(entry.path)}>
                      <Folder size={16} class="text-[var(--accent)]" />
                      <span class="truncate">{entry.name}</span>
                    </button>
                  )}
                </For>
                <Show when={!current().directories.length && !loading()}>
                  <p class="px-2 py-4 text-sm text-[var(--text-muted)]">此目录没有可访问的子文件夹</p>
                </Show>
              </>
            )}
          </Show>
        </div>
        <div class="flex items-center justify-between border-t border-[var(--border-color)] px-4 py-3">
          <span class="min-w-0 truncate font-mono text-xs text-[var(--text-muted)]">{listing()?.path || path()}</span>
          <button class="ml-4 flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" disabled={!listing()} onClick={selectCurrent}>
            <Check size={15} />
            使用当前文件夹
          </button>
        </div>
      </div>
    </ModalDialog>
  )
}

export const ServerProfileIcon: Component<{ profile: ServerProfile }> = (p) =>
  p.profile.mode === "local" ? <HardDrive size={14} /> : <Server size={14} />
