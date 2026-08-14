import { createMemo, createSignal, For, Show, type Component } from "solid-js"
import { useApp } from "../../lib/store/provider"
import type { MessagePart, ToolPart } from "../../lib/protocol/types"
import { DiffView } from "../diff/diff-view"

export interface ReviewProps {
  sessionID: string
}

interface FileChange {
  file: string
  tool: string
  adds: number
  dels: number
  diff: string
  added: boolean
}

/** 统计 unified diff 的 +/- 行数。 */
function countDiff(diff: string): { adds: number; dels: number } {
  let adds = 0
  let dels = 0
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) adds++
    else if (line.startsWith("-") && !line.startsWith("---")) dels++
  }
  return { adds, dels }
}

/** 从工具 part 提取 diff 文本。 */
function extractDiff(part: ToolPart): string {
  const st = part.state
  const out = st?.output
  const candidates: unknown[] = [out]
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>
    candidates.push(o.content, o.result, o.output, o.patch, o.diff)
    if (typeof o.diff === "object" && o.diff !== null) candidates.push((o.diff as Record<string, unknown>).content)
  }
  for (const c of candidates) {
    if (typeof c === "string" && (c.includes("\n+") || c.includes("\n-") || c.startsWith("+") || c.startsWith("-"))) return c
  }
  return ""
}

function filePathOf(part: ToolPart): string {
  const meta = (part.state?.metadata ?? {}) as Record<string, unknown>
  const input = (part.state?.input ?? {}) as Record<string, unknown>
  return String(meta.file_path ?? meta.filePath ?? input.file_path ?? input.path ?? part.tool ?? "")
}

/**
 * 审查 Tab（OpenCode 官方样式）：聚合会话内文件变更，行级 +N -M，可展开 diff；
 * 统一/并排视图切换、全部展开。数据从 message parts 派生。
 */
export const Review: Component<ReviewProps> = (p) => {
  const { store } = useApp()
  const [view, setView] = createSignal<"unified" | "side">("unified")
  const [expandAll, setExpandAll] = createSignal(false)
  const [openFiles, setOpenFiles] = createSignal<Set<string>>(new Set())

  const messages = () => (p.sessionID ? store.sessionMessages(p.sessionID) : [])

  const changes = createMemo<FileChange[]>(() => {
    const map = new Map<string, FileChange>()
    for (const m of messages()) {
      for (const part of m.parts as MessagePart[]) {
        if (part.type !== "tool") continue
        const tp = part as ToolPart
        if (!["edit", "apply_patch", "write"].includes(tp.tool)) continue
        const diff = extractDiff(tp)
        const file = filePathOf(tp) || "未命名"
        const { adds, dels } = countDiff(diff)
        const cur = map.get(file)
        if (cur) {
          cur.adds += adds
          cur.dels += dels
          if (diff) cur.diff = diff
        } else {
          map.set(file, { file, tool: tp.tool, adds, dels, diff, added: tp.tool === "write" || dels === 0 })
        }
      }
    }
    return Array.from(map.values())
  })

  const isOpen = (file: string) => expandAll() || openFiles().has(file)

  function toggle(file: string) {
    setOpenFiles((prev) => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      {/* 工具栏：来源 + 视图切换 + 全部展开 */}
      <div class="flex items-center gap-2 border-b border-[var(--border-color)] px-3 py-2">
        <span class="rounded-md border border-[var(--border-color)] bg-[var(--bg-raised)] px-2 py-1 text-xs text-[var(--text-secondary)]">
          Git 变更
        </span>
        <div class="ml-auto flex items-center gap-1">
          <ViewBtn label="统一视图" active={view() === "unified"} onClick={() => setView("unified")} />
          <ViewBtn label="并排视图" active={view() === "side"} onClick={() => setView("side")} />
          <button
            class="ml-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            onClick={() => setExpandAll(!expandAll())}
          >
            {expandAll() ? "全部收起" : "全部展开"}
          </button>
        </div>
      </div>

      {/* 变更列表 */}
      <div class="min-h-0 flex-1 overflow-y-auto">
        <Show when={changes().length === 0}>
          <p class="py-8 text-center text-sm text-[var(--text-muted)]">暂无文件变更</p>
        </Show>
        <For each={changes()}>
          {(c) => (
            <div class="border-b border-[var(--border-color)]">
              <button
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-hover)]"
                onClick={() => toggle(c.file)}
              >
                <span class={`transition-transform ${isOpen(c.file) ? "rotate-90" : ""}`}>›</span>
                <span class="min-w-0 flex-1 truncate text-[var(--text-primary)]">{c.file}</span>
                <span class={`shrink-0 text-[10px] ${c.added ? "text-[var(--success)]" : "text-[var(--warning)]"}`}>
                  {c.added ? "已添加" : "已修改"}
                </span>
                <span class="shrink-0 font-mono text-[10px] text-[var(--diff-add)]">+{c.adds}</span>
                <span class="shrink-0 font-mono text-[10px] text-[var(--diff-delete)]">-{c.dels}</span>
              </button>
              <Show when={isOpen(c.file) && c.diff}>
                <div class="px-2 pb-2">
                  <DiffView diff={c.diff} />
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

const ViewBtn: Component<{ label: string; active: boolean; onClick: () => void }> = (p) => (
  <button
    class={`rounded-md px-2 py-1 text-xs transition-colors ${
      p.active ? "bg-[var(--bg-raised)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
    }`}
    onClick={p.onClick}
  >
    {p.label}
  </button>
)
