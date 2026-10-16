import { Show, type Component } from "solid-js"
import { SquareTerminal } from "lucide-solid"
import { TerminalPane } from "../../terminal/terminal-pane"

export interface TerminalSectionProps {
  /** PTY 所属会话 id；未选会话时显示占位。 */
  sessionID: string | null
}

/**
 * 右栏「终端」段：渲染 PTY 终端。
 * 点击入口行由父级打开底部终端面板，本段只负责右栏内嵌视图。
 */
export const TerminalSection: Component<TerminalSectionProps> = (p) => (
  <div class="flex min-h-0 flex-1 flex-col">
    <Show
      when={p.sessionID}
      fallback={
        <div class="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-raised)] text-[var(--text-muted)]">
            <SquareTerminal size={18} />
          </span>
          <p class="text-xs text-[var(--text-secondary)]">请先选择一个任务</p>
          <p class="max-w-[16rem] text-[10px] leading-relaxed text-[var(--text-muted)]">选中任务后即可在这里打开它的终端。</p>
        </div>
      }
    >
      {/* TerminalPane 的 sessionID 为必填，这里已由 Show 保证非空 */}
      <TerminalPane sessionID={p.sessionID!} />
    </Show>
  </div>
)
