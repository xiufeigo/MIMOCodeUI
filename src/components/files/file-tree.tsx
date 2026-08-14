import { createEffect, createSignal, For, Show, type Component } from "solid-js"
import { ChevronLeft, FileText } from "lucide-solid"
import { useClient } from "../../lib/store/provider"
import type { FileEntry } from "../../lib/protocol/types"

export interface FileTreeProps {
  /** 会话目录，仅作为根节点显示标签；不直接作为 API 路径。 */
  root: string
  /** 返回会话列表。 */
  onBack: () => void
  /** 是否允许新建（仅本地 Tauri 后端）。 */
  canWrite: boolean
}

/**
 * 左栏文件目录树。MiMo 的 /file 接口只接受相对 serve 工作区根的路径，
 * 因此根请求使用 path=""，子节点仅使用返回的相对路径；会话目录只用于显示。
 * 点击文件会读取内容并内联预览。
 */
export const FileTree: Component<FileTreeProps> = (p) => {
  const [preview, setPreview] = createSignal<{ name: string; content: string } | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [refreshKey, setRefreshKey] = createSignal(0)

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 items-center justify-between border-b border-[var(--border-color)] px-2 py-1.5">
        <button
          class="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          onClick={p.onBack}
        >
          <ChevronLeft size={13} />
          返回项目列表
        </button>
        <button
          class="rounded px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          title="刷新目录"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          刷新
        </button>
      </div>

      <div class="shrink-0 truncate border-b border-[var(--border-color)] px-2 py-1 text-[10px] text-[var(--text-muted)]" title={p.root}>
        工作区根目录{p.root ? ` · ${baseName(p.root)}` : ""}
      </div>

      <Show when={error()}>
        <p class="px-2 py-2 text-[10px] text-[var(--error)]">{error()}</p>
      </Show>

      <div class="min-h-0 flex-1 overflow-y-auto py-1">
        <Show
          when={preview()}
          fallback={
            <TreeNode
              path=""
              rootLabel={baseName(p.root) || "工作区"}
              depth={0}
              refreshKey={refreshKey()}
              canWrite={p.canWrite}
              onError={setError}
              onOpenFile={(name, content) => setPreview({ name, content })}
            />
          }
        >
          {(current) => (
            <div class="flex h-full min-h-0 flex-col">
              <button
                class="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                onClick={() => setPreview(null)}
              >
                <ChevronLeft size={13} />
                返回目录
              </button>
              <div class="flex shrink-0 items-center gap-1.5 border-y border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                <FileText size={13} class="shrink-0 text-[var(--text-muted)]" />
                <span class="min-w-0 flex-1 truncate">{current().name}</span>
              </div>
              <pre class="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-2 py-2 font-mono text-[10px] leading-relaxed text-[var(--text-primary)]">
                {current().content}
              </pre>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : path
}

interface TreeNodeProps {
  /** 相对 serve 工作区根的 API 路径；根为 ""。 */
  path: string
  /** 根节点显示名。 */
  rootLabel?: string
  depth: number
  refreshKey: number
  canWrite: boolean
  onError: (message: string | null) => void
  onOpenFile: (name: string, content: string) => void
}

const TreeNode: Component<TreeNodeProps> = (p) => {
  const client = useClient()
  const [entries, setEntries] = createSignal<FileEntry[] | null>(null)
  const [loadError, setLoadError] = createSignal<string | null>(null)
  const [expanded, setExpanded] = createSignal(p.depth === 0)
  const [loading, setLoading] = createSignal(false)

  async function load() {
    const c = client()
    if (!c) return
    setLoading(true)
    setLoadError(null)
    try {
      setEntries(await c.listFiles(p.path))
    } catch (cause) {
      setLoadError((cause as Error).message)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }
  createEffect(() => {
    void p.refreshKey
    void load()
  })

  const isDir = (e: FileEntry) => e.type === "directory" || e.isDirectory === true

  return (
    <div class="min-w-0">
      <button
        class="flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        style={{ "padding-left": `${8 + p.depth * 12}px` }}
        onClick={() => {
          if (!expanded() && entries() === null) void load()
          setExpanded(!expanded())
        }}
      >
        <span class={`shrink-0 transition-transform ${expanded() ? "rotate-90" : ""}`}>›</span>
        <span class="shrink-0">{p.depth === 0 ? "📁" : "📁"}</span>
        <span class="min-w-0 flex-1 truncate">{p.depth === 0 ? (p.rootLabel ?? "工作区") : baseName(p.path)}</span>
      </button>
      <Show when={loadError()}>
        <p class="px-3 py-1 text-[10px] text-[var(--error)]">{loadError()}</p>
      </Show>
      <Show when={loading()}>
        <p class="px-3 py-1 text-[10px] text-[var(--text-muted)]">加载中…</p>
      </Show>
      <Show when={expanded() && !loading() && entries() !== null}>
        <Show
          when={entries()!.length > 0}
          fallback={<p class="px-3 py-1 text-[10px] text-[var(--text-muted)]">目录为空</p>}
        >
          <For each={entries()}>
            {(entry) =>
              isDir(entry) ? (
                <TreeNode path={entry.path} depth={p.depth + 1} refreshKey={p.refreshKey} canWrite={p.canWrite} onError={p.onError} onOpenFile={p.onOpenFile} />
              ) : (
                <FileRow entry={entry} depth={p.depth + 1} onOpenFile={p.onOpenFile} />
              )
            }
          </For>
        </Show>
      </Show>
    </div>
  )
}

const FileRow: Component<{ entry: FileEntry; depth: number; onOpenFile: (name: string, content: string) => void }> = (p) => {
  const client = useClient()
  const [openError, setOpenError] = createSignal<string | null>(null)

  async function openFile() {
    const c = client()
    if (!c) return
    setOpenError(null)
    try {
      const res = await c.readFile(p.entry.path)
      p.onOpenFile(p.entry.name, res.content)
    } catch (cause) {
      setOpenError((cause as Error).message)
    }
  }

  return (
    <div class="min-w-0">
      <button
        class="flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-left text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        style={{ "padding-left": `${8 + p.depth * 12}px` }}
        onClick={() => void openFile()}
        title={p.entry.name}
      >
        <span class="shrink-0">📄</span>
        <span class="min-w-0 flex-1 truncate">{p.entry.name}</span>
      </button>
      <Show when={openError()}>
        <p class="px-3 py-1 text-[10px] text-[var(--error)]">{openError()}</p>
      </Show>
    </div>
  )
}
