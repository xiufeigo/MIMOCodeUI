import { For, Show, type Component } from "solid-js"
import {
  ChevronDown,
  List,
  PanelBottom,
  PanelLeftOpen,
  PanelRight,
  PanelRightOpen,
  Plus,
  Search,
} from "lucide-solid"
import type { ShellChrome } from "../../lib/shell-layout"

/**
 * CustomTitlebar 的窗口键是 position:fixed 且 z-index 更高，会盖住主区顶栏最右侧的按钮
 * （右侧栏收起时「切换侧边栏」正好落在这一带）。故右栏收起时必须为顶栏预留这段宽度。
 * 数值与 CustomTitlebar 里三个 w-11 按钮 + 两侧 padding 对齐。
 */
const WINDOW_CONTROLS_INSET = 132

export interface ShellHeaderProps {
  /** 由 deriveShellChrome() 推导出的按钮分布，本组件不自行判断。 */
  chrome: ShellChrome
  /** 会话标题；为空时不渲染标题区。 */
  title?: string
  /** 标题右侧的「更多」插槽。 */
  trailing?: unknown
  showSearch: boolean
  searchActive?: boolean
  /** 手机端布局：更高的触控目标。 */
  compact?: boolean
  onOpenLeft: () => void
  onNewTask: () => void
  onSearchClick: () => void
  onToggleInfo: () => void
  onToggleBottom: () => void
  onToggleRight: () => void
  onToggleMore?: () => void
  /**
   * 「打开左侧栏」按钮的悬停意图。用于左栏悬停预览：
   * 浮层弹出后会盖住该按钮，所以显示/收起的时序由父级统一管理。
   */
  onHoverLeftIntent?: (show: boolean) => void
}

interface ToolButtonProps {
  label: string
  active?: boolean
  compact?: boolean
  onClick: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  children: unknown
}

/** 顶栏图标按钮。触控目标在 compact 下放大到 44px，满足 Android 触控。 */
const ToolButton: Component<ToolButtonProps> = (p) => {
  const base = (active?: boolean) =>
    `flex items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
      active ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : ""
    } ${p.compact ? "h-11 min-w-11 px-2" : "h-8 w-8"}`

  return (
    <button
      type="button"
      class={base(p.active)}
      onClick={p.onClick}
      onMouseEnter={() => p.onMouseEnter?.()}
      onMouseLeave={() => p.onMouseLeave?.()}
      title={p.label}
      aria-label={p.label}
      aria-pressed={p.active ? "true" : undefined}
    >
      {p.children as never}
    </button>
  )
}

/**
 * 主区顶栏。
 *
 * 按钮摆在哪**不由本组件决定**，而是完全服从 `deriveShellChrome()` 的推导结果——
 * 这样「右侧栏打开时，切换侧边栏迁移到右栏顶栏」这条规则只存在于一个纯函数里，
 * 有单测覆盖（见 src/lib/shell-layout.test.ts）。
 */
export const ShellHeader: Component<ShellHeaderProps> = (p) => {
  return (
    <div
      class="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-color)] px-3"
      style={
        p.chrome.reserveWindowControlsSpace
          ? { "padding-right": `${WINDOW_CONTROLS_INSET}px` }
          : undefined
      }
    >
      {/* 左侧：仅在左侧栏关闭时出现「打开左侧栏 / 新建任务」 */}
      <div class="flex items-center gap-1">
        <For each={p.chrome.mainLeft}>
          {(action) => (
            <Show
              when={action === "openLeft"}
              fallback={
                <ToolButton label="新建任务" compact={p.compact} onClick={p.onNewTask}>
                  <Plus size={16} class="rounded-md bg-[var(--bg-hover)] p-0.5" />
                </ToolButton>
              }
            >
              <ToolButton
                label="打开左侧栏"
                compact={p.compact}
                onClick={p.onOpenLeft}
                onMouseEnter={() => p.onHoverLeftIntent?.(true)}
                onMouseLeave={() => p.onHoverLeftIntent?.(false)}
              >
                <PanelLeftOpen size={15} />
              </ToolButton>
            </Show>
          )}
        </For>
      </div>

      <Show when={p.showSearch}>
        <ToolButton
          label="搜索任务"
          active={p.searchActive}
          compact={p.compact}
          onClick={p.onSearchClick}
        >
          <Search size={15} />
        </ToolButton>
      </Show>

      {/* 中部：会话标题 */}
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <Show when={p.title}>
          <span class="truncate text-sm font-medium text-[var(--text-primary)]">{p.title}</span>
        </Show>
        <Show when={p.onToggleMore}>
          <button
            type="button"
            class={`flex items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
              p.compact ? "h-11 min-w-11" : "h-8 w-8"
            }`}
            onClick={() => p.onToggleMore?.()}
            title="更多操作"
            aria-label="更多操作"
          >
            <ChevronDown size={15} class="-rotate-90" />
          </button>
        </Show>
        {p.trailing as never}
      </div>

      {/* 右侧：信息栏 / 切换底部 /（右栏关闭时的）切换侧边栏 */}
      <div class="flex shrink-0 items-center gap-1">
        <For each={p.chrome.mainRight}>
          {(action) => (
            <Show when={action === "info"}>
              <ToolButton label="信息栏" compact={p.compact} onClick={p.onToggleInfo}>
                <List size={16} />
              </ToolButton>
            </Show>
          )}
        </For>
        <ToolButton label="切换底部" compact={p.compact} onClick={p.onToggleBottom}>
          <PanelBottom size={16} />
        </ToolButton>
        <Show when={p.chrome.mainRight.includes("rightPanel")}>
          <ToolButton label="切换侧边栏" compact={p.compact} onClick={p.onToggleRight}>
            <PanelRight size={16} />
          </ToolButton>
        </Show>
        <Show when={!p.chrome.mainRight.includes("rightPanel")}>
          {/* 占位保持右侧按钮组不跳动；右栏打开时该按钮已迁移 */}
          <span class="hidden" aria-hidden="true">
            <PanelRightOpen size={16} />
          </span>
        </Show>
      </div>
    </div>
  )
}
