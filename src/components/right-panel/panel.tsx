import { createSignal, For, Show, type Component, type JSX } from "solid-js"
import {
  FileDiff,
  Files,
  Globe,
  Maximize2,
  MessageSquare,
  Minimize2,
  PanelRightClose,
  Plus,
  SquareTerminal,
} from "lucide-solid"
import { Review } from "./review"
import { FilesSection, TerminalSection, ChatSection, BrowserSection } from "./sections"

export type RightPanelSection = "review" | "files" | "chat" | "browser" | "terminal"

export interface RightPanelProps {
  open: boolean
  expanded: boolean
  /** 当前布局是否允许展开；为 false 时展开按钮禁用。 */
  canExpand: boolean
  /** 未展开时的固定宽度（px）。 */
  width: number
  sessionID: string | null
  onClose: () => void
  onToggleExpanded: () => void
  onNewTask: () => void
  /** 请求父级打开底部终端面板。 */
  onRequestBottomTerminal: () => void
  onPanelElement?: (el: HTMLElement | null) => void
}

interface SectionItem {
  id: RightPanelSection
  label: string
  /** 入口行图标（工厂函数：Solid 模板里按行实例化）。 */
  icon: () => JSX.Element
  /** 行右侧的快捷键提示标签。 */
  shortcut?: string
}

/** 五个入口的固定顺序。 */
const SECTION_ITEMS: SectionItem[] = [
  { id: "review", label: "审查", icon: () => <FileDiff size={16} /> },
  { id: "files", label: "文件", icon: () => <Files size={16} />, shortcut: "Ctrl+P" },
  { id: "chat", label: "侧边聊天", icon: () => <MessageSquare size={16} /> },
  { id: "browser", label: "浏览器", icon: () => <Globe size={16} /> },
  { id: "terminal", label: "终端", icon: () => <SquareTerminal size={16} /> },
]

const ICON_BUTTON_CLASS =
  "flex h-8 w-8 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"

/**
 * 右侧栏：顶栏一行 + 下面五段入口列表（审查 / 文件 / 侧边聊天 / 浏览器 / 终端）。
 * 入口行只负责切换当前段；「终端」行额外通知父级打开底部终端面板。
 */
export const RightPanel: Component<RightPanelProps> = (p) => {
  const [section, setSection] = createSignal<RightPanelSection>("review")
  /** 上一个非「文件」入口，供文件树的「返回」使用。 */
  const [previousSection, setPreviousSection] = createSignal<RightPanelSection>("review")

  function select(id: RightPanelSection) {
    if (id !== "files") setPreviousSection(id)
    setSection(id)
    // 终端入口同时请求父级打开底部终端面板
    if (id === "terminal") p.onRequestBottomTerminal()
  }

  const expandTitle = () => {
    if (!p.canExpand) return "当前布局不支持展开"
    return p.expanded ? "收起面板" : "展开面板"
  }

  return (
    <Show when={p.open}>
      <aside
        id="right-panel"
        ref={(element) => p.onPanelElement?.(element)}
        class={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] transition-[width] duration-150 ${
          p.expanded ? "flex-1" : "shrink-0"
        }`}
        style={p.expanded ? undefined : { width: `${p.width}px` }}
      >
        {/* 顶栏：左侧新建任务，右侧展开/收起与切换侧边栏。 */}
        <div class="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--border-color)] px-2">
          <button
            class={ICON_BUTTON_CLASS}
            onClick={p.onNewTask}
            title="新建任务"
            aria-label="新建任务"
          >
            <Plus size={15} />
          </button>
          <div class="ml-auto flex items-center gap-1">
            <button
              class={ICON_BUTTON_CLASS}
              disabled={!p.canExpand}
              onClick={p.onToggleExpanded}
              title={expandTitle()}
              aria-label={expandTitle()}
            >
              <Show when={p.expanded} fallback={<Maximize2 size={14} />}>
                <Minimize2 size={14} />
              </Show>
            </button>
            <button
              class={ICON_BUTTON_CLASS}
              onClick={p.onClose}
              title="切换侧边栏"
              aria-label="切换侧边栏"
            >
              <PanelRightClose size={14} />
            </button>
          </div>
        </div>

        {/* 入口列表 */}
        <nav class="shrink-0 space-y-0.5 border-b border-[var(--border-color)] px-2 py-2" aria-label="右侧栏入口">
          <For each={SECTION_ITEMS}>
            {(item) => (
              <button
                class={`flex h-[52px] w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors ${
                  section() === item.id
                    ? "bg-[var(--bg-raised)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                }`}
                onClick={() => select(item.id)}
                aria-current={section() === item.id ? "true" : undefined}
                title={item.label}
              >
                <span class="flex w-4 shrink-0 items-center justify-center text-[var(--text-muted)]">{item.icon()}</span>
                <span class="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                {/*
                  快捷键标签仅作提示，尚未注册全局监听（由全局快捷键层统一处理），
                  避免在输入框里打字时被右栏抢占按键。
                */}
                <Show when={item.shortcut}>
                  <kbd class="rounded border border-[var(--border-color)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                    {item.shortcut}
                  </kbd>
                </Show>
              </button>
            )}
          </For>
        </nav>

        {/* 当前入口内容 */}
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Show when={section() === "review"}>
            <Show
              when={p.sessionID}
              fallback={<SectionEmpty text="请先选择一个任务" hint="选中任务后即可查看它的文件变更。" />}
            >
              <Review sessionID={p.sessionID!} />
            </Show>
          </Show>
          <Show when={section() === "files"}>
            <FilesSection sessionID={p.sessionID} onBack={() => setSection(previousSection())} />
          </Show>
          <Show when={section() === "chat"}>
            <ChatSection sessionID={p.sessionID} />
          </Show>
          <Show when={section() === "browser"}>
            <BrowserSection />
          </Show>
          <Show when={section() === "terminal"}>
            <TerminalSection sessionID={p.sessionID} />
          </Show>
        </div>
      </aside>
    </Show>
  )
}

/** 段内空态：没有选中会话时的统一提示。 */
const SectionEmpty: Component<{ text: string; hint: string }> = (p) => (
  <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
    <p class="text-xs text-[var(--text-secondary)]">{p.text}</p>
    <p class="max-w-[16rem] text-[10px] leading-relaxed text-[var(--text-muted)]">{p.hint}</p>
  </div>
)
