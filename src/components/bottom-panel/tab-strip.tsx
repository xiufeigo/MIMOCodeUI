import { Plus, X } from "lucide-solid"
import type { Component } from "solid-js"

export interface TabStripProps {
  /** 关闭当前标签：面板内只有「终端」一个标签，关闭等同于收起整个面板。 */
  onCloseTab: () => void
  /** 关闭整个底部面板。 */
  onClosePanel: () => void
  /** 新建标签：预留接口，当前无功能（不传也不会报错）。 */
  onNewTab?: () => void
}

/** 图标按钮统一样式：32×32px 最小触控目标，颜色只走主题变量。 */
const iconButtonClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"

/**
 * 底部面板标签栏（高 40px）。
 * 左侧：激活标签「终端 ×」+ 新标签 `+`；最右侧：关闭整个面板的 `×`。
 */
export const TabStrip: Component<TabStripProps> = (p) => (
  <div class="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--border-color)] bg-[var(--bg-surface)] px-2">
    {/* 激活标签：标题 + 关闭按钮。关闭按钮独立于标题，避免嵌套 <button>。 */}
    <div class="flex h-8 shrink-0 items-center gap-0.5 rounded-md bg-[var(--bg-raised)] pr-0.5 pl-2.5 text-sm text-[var(--text-primary)]">
      <span class="whitespace-nowrap">终端</span>
      <button
        class={iconButtonClass}
        onClick={p.onCloseTab}
        title="关闭终端标签"
        aria-label="关闭终端标签"
      >
        <X size={14} />
      </button>
    </div>

    {/* 新标签：当前无功能，保留为可点击按钮（点击不报错、不改变状态）。 */}
    <button
      class={iconButtonClass}
      onClick={() => p.onNewTab?.()}
      title="新建标签页"
      aria-label="新建标签页"
    >
      <Plus size={15} />
    </button>

    {/* 面板级关闭按钮，固定贴在标签栏最右侧。 */}
    <button
      class={`${iconButtonClass} ml-auto`}
      onClick={p.onClosePanel}
      title="关闭底部面板"
      aria-label="关闭底部面板"
    >
      <X size={15} />
    </button>
  </div>
)
