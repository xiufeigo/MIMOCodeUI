import { createEffect, createSignal, For, Show, type Component } from "solid-js"
import { useClient } from "../../lib/store/provider"
import type { FileEntry } from "../../lib/protocol/types"

export interface FileBrowserProps {
  sessionID: string
}

/**
 * Read-only workspace file browser. The server serves relative paths from the
 * workspace root (`/file?path=`); the root listing is `path=""`.
 */
export const FileBrowser: Component<FileBrowserProps> = () => {
  const client = useClient()
  const [selected, setSelected] = createSignal<string | null>(null)
  const [content, setContent] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  async function openFile(path: string) {
    const c = client()
    if (!c) return
    setError(null)
    try {
      const res = await c.readFile(path)
      setContent(res.content)
      setSelected(path)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div class="flex min-h-0 flex-1">
      <div class="flex w-72 shrink-0 flex-col border-r border-[var(--border-color)]">
        <div class="flex h-9 items-center border-b border-[var(--border-color)] px-3 text-xs text-[var(--text-muted)]">
          <span class="truncate font-mono">工作区根目录</span>
        </div>
        <div class="flex-1 overflow-y-auto py-1">
          <DirectoryTree path="" depth={0} selected={selected()} onOpenFile={openFile} onError={setError} />
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <Show
          when={content() !== null}
          fallback={
            <div class="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              选择左侧文件查看内容
            </div>
          }
        >
          <pre class="h-full overflow-auto p-4 font-mono text-xs text-[var(--text-primary)]">{content()}</pre>
        </Show>
        <Show when={error()}>
          <p class="border-t border-[var(--border-color)] px-4 py-2 text-xs text-[var(--error)]">{error()}</p>
        </Show>
      </div>
    </div>
  )
}

interface DirectoryTreeProps {
  path: string
  depth: number
  selected: string | null
  onOpenFile(path: string): void
  onError(msg: string | null): void
}

const isDir = (e: FileEntry) => e.type === "directory" || e.isDirectory === true

const DirectoryTree: Component<DirectoryTreeProps> = (p) => {
  const client = useClient()
  const [entries, setEntries] = createSignal<FileEntry[] | null>(null)
  const [expanded, setExpanded] = createSignal(false)

  createEffect(async () => {
    const c = client()
    if (!c) return
    try {
      setEntries(await c.listFiles(p.path))
    } catch (e) {
      p.onError((e as Error).message)
      setEntries([])
    }
  })

  return (
    <div style={{ "padding-left": `${p.depth * 14}px` }}>
      <For each={entries() ?? []}>
        {(entry) => (
          <div>
            <button
              class={`flex w-full items-center gap-1.5 truncate px-2 py-1 text-left text-sm transition-colors ${
                p.selected === entry.path ? "bg-[var(--bg-raised)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
              }`}
              onClick={() => {
                if (isDir(entry)) {
                  setExpanded(!expanded())
                } else {
                  p.onOpenFile(entry.path)
                }
              }}
            >
              <span class="text-[var(--text-muted)]">{isDir(entry) ? (expanded() ? "▾" : "▸") : ""}</span>
              <span class="truncate">{entry.name}</span>
            </button>
            <Show when={isDir(entry) && expanded()}>
              <DirectoryTree
                path={entry.path}
                depth={p.depth + 1}
                selected={p.selected}
                onOpenFile={p.onOpenFile}
                onError={p.onError}
              />
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}
