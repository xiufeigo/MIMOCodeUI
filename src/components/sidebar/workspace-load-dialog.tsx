import { createMemo, For, Show, type Component } from "solid-js"
import { Check, FolderOpen, X } from "lucide-solid"
import { ModalDialog } from "../overlay/modal-dialog"
import type { SessionInfo } from "../../lib/protocol/types"

/** 任务目录最后一段（展示用）。 */
function dirLabel(directory: string | undefined): string {
  if (!directory) return "未分类"
  const parts = directory.replace(/[\\/]+$/, "").split(/[\\/]/)
  return parts[parts.length - 1] || directory
}

function formatTime(ms: number): string {
  const date = new Date(ms)
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${date.getMonth() + 1}-${date.getDate()} ${hours}:${minutes}`
}

export interface WorkspaceLoadDialogProps {
  open: boolean
  directory: string
  sessions: SessionInfo[]
  /** prompt：确认弹窗；select：勾选指定任务。 */
  stage: "prompt" | "select"
  selected: Set<string>
  onStageChange: (stage: "prompt" | "select") => void
  onSelectedChange: (selected: Set<string>) => void
  onLoadAll: () => void
  onLoadSelected: () => void
  onClose: () => void
}

/**
 * 打开工作区后如有历史任务，弹出提示：
 * 「全部载入」直接载入该目录全部历史任务；「只载入指定」进入勾选列表。
 */
export const WorkspaceLoadDialog: Component<WorkspaceLoadDialogProps> = (p) => {
  const sorted = createMemo(() =>
    [...p.sessions].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0)),
  )

  function toggle(id: string) {
    const next = new Set(p.selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    p.onSelectedChange(next)
  }

  function toggleAll() {
    if (p.selected.size === p.sessions.length) p.onSelectedChange(new Set())
    else p.onSelectedChange(new Set(p.sessions.map((s) => s.id)))
  }

  return (
    <ModalDialog open={p.open} title="载入历史任务" onClose={p.onClose} class="w-full max-w-xl">
      <div class="flex max-h-[calc(100dvh-2rem)] min-h-[16rem] flex-col overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-2xl">
        <div class="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div class="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <FolderOpen size={17} class="text-[var(--accent)]" />
            载入历史任务
          </div>
          <button
            class="flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            title="关闭"
            aria-label="关闭"
            onClick={p.onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* 确认阶段 */}
        <Show when={p.stage === "prompt"}>
          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div>
              <p class="text-sm text-[var(--text-primary)]">
                目录「<span class="font-medium text-[var(--accent)]">{dirLabel(p.directory)}</span>」下找到
                <span class="font-medium text-[var(--text-primary)]">{p.sessions.length}</span> 个历史任务。
              </p>
              <p class="mt-1 text-xs text-[var(--text-muted)]">{p.directory}</p>
            </div>
            <p class="text-xs text-[var(--text-muted)]">要载入这些历史任务吗？载入后可在左侧任务列表中查看与继续。</p>
          </div>
          <div class="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
            <button
              class="rounded-md border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              onClick={p.onClose}
            >
              取消
            </button>
            <button
              class="rounded-md border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              onClick={() => p.onStageChange("select")}
            >
              只载入指定
            </button>
            <button
              class="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              onClick={p.onLoadAll}
            >
              全部载入
            </button>
          </div>
        </Show>

        {/* 勾选阶段 */}
        <Show when={p.stage === "select"}>
          <div class="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-2">
            <p class="text-xs text-[var(--text-muted)]">勾选要载入的任务（共 {p.sessions.length} 个）</p>
            <button
              class="text-xs text-[var(--accent)] hover:underline"
              onClick={toggleAll}
            >
              {p.selected.size === p.sessions.length ? "全不选" : "全选"}
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
            <For each={sorted()}>
              {(session) => {
                const checked = () => p.selected.has(session.id)
                return (
                  <button
                    class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-[var(--bg-hover)]"
                    onClick={() => toggle(session.id)}
                    role="checkbox"
                    aria-checked={checked()}
                  >
                    <span
                      class={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        checked() ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-strong)] bg-[var(--bg-input)]"
                      }`}
                    >
                      <Show when={checked()}>
                        <Check size={12} class="text-white" />
                      </Show>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm text-[var(--text-primary)]">
                        {session.title || session.slug || session.id}
                      </span>
                      <span class="block truncate text-[11px] text-[var(--text-muted)]">
                        {dirLabel(session.directory)}
                        {session.time?.updated ? ` · ${formatTime(session.time.updated)}` : ""}
                      </span>
                    </span>
                  </button>
                )
              }}
            </For>
          </div>
          <div class="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
            <button
              class="rounded-md border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              onClick={() => p.onStageChange("prompt")}
            >
              返回
            </button>
            <button
              class="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
              disabled={p.selected.size === 0}
              onClick={p.onLoadSelected}
            >
              载入所选（{p.selected.size}）
            </button>
          </div>
        </Show>
      </div>
    </ModalDialog>
  )
}
