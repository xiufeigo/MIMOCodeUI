import { createSignal, For, Show, type Component, type JSX } from "solid-js"
import { FileDiff, Layers, Maximize2, Minimize2, MessagesSquare, PanelRightClose } from "lucide-solid"
import { useApp } from "../../lib/store/provider"
import { Review } from "./review"
import { ContextDetail } from "./context-detail"

export interface RightPanelProps {
  /** Compact layouts display this panel as an overlay drawer. */
  drawer?: boolean
  width?: number
  open: boolean
  expanded: boolean
  chatFloating: boolean
  onClose: () => void
  onToggleExpanded: () => void
  onToggleFloatingChat: () => void
  sessionID: string
  onPanelElement?: (element: HTMLElement | null) => void
}

type Tab = "review" | "context"

/**
 * 右侧面板（OpenCode 官方样式）：默认含「审查」「上下文」两个不可关闭的
 * 标签页。审查 = 文件变更列表；上下文 = 待办 + 上下文进度 + 上下文详情。
 */
export const RightPanel: Component<RightPanelProps> = (p) => {
  const { store } = useApp()
  const [tab, setTab] = createSignal<Tab>("context")

  const messages = () => (p.sessionID ? store.sessionMessages(p.sessionID) : [])
  const lastAssistant = () => {
    for (const m of messages()) if (m.info?.role === "assistant") return m
    return null
  }
  const tokenUsage = () => lastAssistant()?.info?.tokens
  const inputTokens = () => tokenUsage()?.input ?? 0
  const contextLimit = () => (p.sessionID ? store.contextLimit(p.sessionID) : 0)
  const contextPct = () => {
    const limit = contextLimit()
    if (limit <= 0) return 0
    return Math.min(100, Math.round((inputTokens() / limit) * 100))
  }

  const isEditTool = (part: { type: string; tool?: string }) =>
    part.type === "tool" && ["edit", "apply_patch", "write"].includes(part.tool ?? "")

  const reviewCount = () => {
    let n = 0
    for (const m of messages()) for (const part of m.parts) if (isEditTool(part as never)) n++
    return n
  }

  const todos = () => {
    const out: string[] = []
    for (const m of messages())
      for (const part of m.parts)
        if (part.type === "tool" && part.tool === "todo_write") {
          const o = (part as { state?: { output?: unknown } }).state?.output
          if (typeof o === "string" && o.trim()) out.push(o.trim())
        }
    return out
  }

  const iconButtonClass =
    "flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"

  return (
    <Show when={p.open}>
      <aside
        id="right-panel"
        ref={(element) => p.onPanelElement?.(element)}
        class={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] transition-[width] duration-150 ${
          p.drawer ? "absolute inset-y-2 right-2 z-30 shadow-2xl" : p.expanded ? "flex-1" : "shrink-0"
        }`}
        style={p.expanded && !p.drawer ? undefined : { width: `${p.width ?? 384}px` }}
      >
        {/* Tab 栏：标签、悬浮对话、展开/还原与收起按钮。 */}
        <div class="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--border-color)] px-2">
          <PanelTab
            icon={<FileDiff size={13} />}
            label={`审查 ${reviewCount()}`}
            active={tab() === "review"}
            onClick={() => setTab("review")}
          />
          <PanelTab
            icon={<Layers size={13} />}
            label="上下文"
            active={tab() === "context"}
            onClick={() => setTab("context")}
          />
          <div class="ml-auto flex items-center gap-1">
            <Show when={p.expanded}>
              <button
                class={`${iconButtonClass} ${p.chatFloating ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : ""}`}
                onClick={p.onToggleFloatingChat}
                title={p.chatFloating ? "关闭悬浮对话面板" : "悬浮对话面板"}
                aria-label={p.chatFloating ? "关闭悬浮对话面板" : "悬浮对话面板"}
              >
                <MessagesSquare size={14} />
              </button>
            </Show>
            <button
              class={iconButtonClass}
              onClick={p.onToggleExpanded}
              title={p.expanded ? "还原面板" : "展开面板"}
              aria-label={p.expanded ? "还原面板" : "展开面板"}
            >
              <Show when={p.expanded} fallback={<Maximize2 size={14} />}>
                <Minimize2 size={14} />
              </Show>
            </button>
            <button class={iconButtonClass} onClick={p.onClose} title="收起右侧栏" aria-label="收起右侧栏">
              <PanelRightClose size={14} />
            </button>
          </div>
        </div>

        {/* 内容 */}
        <Show when={tab() === "review"}>
          <Review sessionID={p.sessionID} />
        </Show>

        <Show when={tab() === "context"}>
          <div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
            {/* 待办 */}
            <div class="mb-3 rounded-lg border border-[var(--border-color)] p-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs font-medium text-[var(--text-secondary)]">待办</span>
              </div>
              <Show
                when={todos().length > 0}
                fallback={<p class="text-xs text-[var(--text-muted)]">暂无待办，复杂任务的进展会显示在这里</p>}
              >
                <For each={todos()}>
                  {(t) => (
                    <div class="flex items-start gap-2 py-0.5 text-xs text-[var(--text-secondary)]">
                      <span class="mt-0.5 h-3 w-3 shrink-0 rounded border border-[var(--border-strong)]" />
                      <span class="whitespace-pre-wrap">{t}</span>
                    </div>
                  )}
                </For>
              </Show>
            </div>

            {/* 上下文进度 */}
            <div class="mb-3 rounded-lg border border-[var(--border-color)] p-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs font-medium text-[var(--text-secondary)]">上下文</span>
                <span class="text-[10px] text-[var(--text-muted)]">{contextPct()}%</span>
              </div>
              <div class="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-raised)]">
                <div
                  class="h-full rounded-full"
                  style={{ width: `${contextPct()}%`, background: contextPct() > 80 ? "var(--error)" : "var(--accent)" }}
                />
              </div>
            </div>

            {/* 上下文详情（OpenCode 官方样式，独立整页展示） */}
            <ContextDetail sessionID={p.sessionID} />
          </div>
        </Show>
      </aside>
    </Show>
  )
}

const PanelTab: Component<{ icon?: JSX.Element; label: string; active: boolean; onClick: () => void }> = (p) => (
  <button
    class={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors ${
      p.active ? "bg-[var(--bg-raised)] font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
    }`}
    onClick={p.onClick}
  >
    {p.icon}
    {p.label}
  </button>
)

