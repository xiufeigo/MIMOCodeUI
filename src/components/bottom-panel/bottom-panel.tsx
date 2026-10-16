import { createEffect, onCleanup, Show, type Component } from "solid-js"
import { TerminalPane } from "../terminal/terminal-pane"
import { TabStrip } from "./tab-strip"

export interface BottomPanelProps {
  /** 面板是否展开（展开 236px，收起 0）。 */
  open: boolean
  /** 当前会话 id；为 null 时不挂载终端（TerminalPane 需要真实会话）。 */
  sessionID: string | null
  /** 收起整个面板。 */
  onClose: () => void
}

/** 展开后的固定高度（px）；收起时为 0。 */
const EXPANDED_HEIGHT = 236

/**
 * 底部面板（终端）：位于中栏底部，通过 CSS `transition-[height]` 在
 * 236px 与 0 之间做展开/收起动画——不使用任何 JS 定时器控制动画。
 */
export const BottomPanel: Component<BottomPanelProps> = (p) => {
  // ---- xterm 尺寸修复（关键）----
  // xterm 的 FitAddon 依赖容器的 clientWidth/clientHeight 换算行列数；
  // 面板收起时容器高度为 0，此时测得 0 行列并被缓存。之后即使展开，
  // xterm 自身不会感知到尺寸变化，终端会出现空白/错乱。由于本组件不允许
  // 修改 terminal-pane.tsx（它只在 window "resize" 时重新 fit），这里在
  // open 由 false 变 true 后，于 requestAnimationFrame 中（此时 DOM 已完成
  // 一次布局、容器高度已恢复为 236px）派发一次 window resize 事件，
  // 借它的 onResize 回调触发 fit.fit() 与服务端 PTY 尺寸同步。
  let wasOpen = false
  let resizeFrame = 0

  createEffect(() => {
    const open = p.open
    if (open && !wasOpen) {
      // 取消上一次未执行的帧，避免快速开关时用过期状态触发 fit。
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        // 帧回调执行时若已被再次收起，则无需（也不应）重新测量。
        if (p.open) window.dispatchEvent(new Event("resize"))
      })
    }
    wasOpen = open
  })

  onCleanup(() => cancelAnimationFrame(resizeFrame))

  return (
    // 收起时 border-top 改为 transparent：height:0 时 1px 边框仍会绘制，
    // 会在内容区上方残留一条横线。
    <div
      id="bottom-panel"
      class={`flex w-full shrink-0 flex-col overflow-hidden bg-[var(--bg-surface)] transition-[height] duration-150 ease-out ${
        p.open ? "border-t border-[var(--border-color)]" : "border-t border-transparent invisible"
      }`}
      style={{ height: `${p.open ? EXPANDED_HEIGHT : 0}px` }}
      aria-hidden={!p.open}
    >
      <TabStrip onCloseTab={p.onClose} onClosePanel={p.onClose} />

      {/* 内容区：TerminalPane 只随 sessionID 挂载，开合面板不卸载它，
          避免每次展开都重建 PTY 连接（因此才需要上面的 resize 重新 fit）。 */}
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Show
          when={p.sessionID}
          fallback={
            <div class="flex min-h-0 flex-1 items-center justify-center bg-[var(--bg-app)] text-sm text-[var(--text-muted)]">
              未选择会话，打开一个会话后即可在此使用终端
            </div>
          }
        >
          <TerminalPane sessionID={p.sessionID!} />
        </Show>
      </div>
    </div>
  )
}
