import { createSignal, createEffect, Show, type Component } from "solid-js"
import { Minus, Square, X, Copy, PanelLeftClose, PanelLeftOpen, Search, Settings } from "lucide-solid"
import { getCurrentWindow } from "@tauri-apps/api/window"

export interface TitlebarProps {
  /** 是否显示任务栏按钮。 */
  showNavigation?: boolean
  /** 是否显示搜索按钮。 */
  showSearch?: boolean
  /** 左侧栏展开状态（用于按钮图标/提示切换）。 */
  navExpanded: boolean
  navButtonRef?: (element: HTMLButtonElement) => void
  onToggleNav: () => void
  /** 打开全局任务搜索弹框。 */
  onSearchClick: () => void
  /** 任务搜索弹框当前是否打开（用于按钮高亮）。 */
  searchActive: boolean
  onOpenSettings: () => void
}

/**
 * 自定义无边框标题栏（Trae 风格）：左侧为「隐藏任务栏」「搜索」按钮
 * （与右侧窗口控制按钮同一高度，不随左侧栏折叠而消失），中间整条可
 * 拖拽窗口，右侧提供 最小化 / 最大化(还原) / 关闭。
 *
 * 仅在 Tauri 环境启用原生窗口控制；纯浏览器调试时按钮退化为空操作。
 */
export const CustomTitlebar: Component<TitlebarProps> = (p) => {
  const [maximized, setMaximized] = createSignal(false)
  const isTauri = () =>
    typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined"

  // 窗口状态监听（最大化后同步按钮图标）
  createEffect(() => {
    if (!isTauri()) return
    let disposed = false
    const win = getCurrentWindow()
    let unlisten: (() => void) | undefined
    win
      .onResized(() => {
        if (disposed) return
        win.isMaximized().then(setMaximized).catch(() => {})
      })
      .then((fn) => (unlisten = fn))
      .catch(() => {})
    return () => {
      disposed = true
      unlisten?.()
    }
  })

  function minimize() {
    if (!isTauri()) return
    getCurrentWindow().minimize()
  }
  function toggleMaximize() {
    if (!isTauri()) return
    getCurrentWindow().toggleMaximize()
  }
  function close() {
    if (!isTauri()) return
    getCurrentWindow().close()
  }

  const toolBtn = (active = false) =>
    `flex h-full w-9 items-center justify-center text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
      active ? "bg-[var(--bg-hover)] text-[var(--text-secondary)]" : ""
    }`
  const winBtn =
    "flex h-full w-11 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"

  return (
    <div data-tauri-drag-region class="flex h-8 shrink-0 select-none items-stretch justify-between bg-[var(--bg-app)]">
      {/* 左侧：隐藏任务栏 + 搜索 + 设置（不随左侧栏折叠） */}
      <div class="flex h-full items-stretch">
        <Show when={p.showNavigation !== false}>
          <button
            ref={(element) => p.navButtonRef?.(element)}
            class={toolBtn()}
            onClick={p.onToggleNav}
            title={p.navExpanded ? "隐藏任务栏" : "展开任务栏"}
            aria-label={p.navExpanded ? "隐藏任务栏" : "展开任务栏"}
          >
            <Show when={p.navExpanded} fallback={<PanelLeftOpen size={15} />}>
              <PanelLeftClose size={15} />
            </Show>
          </button>
        </Show>
        <Show when={p.showSearch !== false}>
          <button
            class={toolBtn(p.searchActive)}
            onClick={p.onSearchClick}
            title="搜索任务"
            aria-label="搜索任务"
          >
            <Search size={15} />
          </button>
        </Show>
        <button class={toolBtn()} onClick={p.onOpenSettings} title="设置" aria-label="设置">
          <Settings size={15} />
        </button>
      </div>

      {/* 中部拖拽区（整条剩余空间可拖拽窗口） */}
      <div data-tauri-drag-region class="min-w-0 flex-1" />

      {/* 右侧：窗口控制按钮 */}
      <div class="flex h-full items-stretch">
        <button class={winBtn} onClick={minimize} title="最小化" aria-label="最小化">
          <Minus size={15} />
        </button>
        <button class={winBtn} onClick={toggleMaximize} title={maximized() ? "还原" : "最大化"} aria-label="最大化">
          <Show when={maximized()} fallback={<Square size={13} />}>
            <Copy size={13} />
          </Show>
        </button>
        <button
          class="flex h-full w-11 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--error)] hover:text-white"
          onClick={close}
          title="关闭"
          aria-label="关闭"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
