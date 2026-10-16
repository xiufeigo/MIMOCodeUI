// 左侧栏悬停预览（flyout）。
//
// 设计要点（这些是踩过坑总结的，改动前请先读）：
//  1. 触发区是主区顶栏的「打开左侧栏」**按钮本身**，不是屏幕左边缘。
//     因此父级把按钮作为 children 传进来，组件在包裹元素上挂
//     mouseenter / mouseleave，并通过 onHoverIntent 通知父层。
//  2. 浮层出现后会**盖住触发按钮**（浮层固定在左侧 10px，正好覆盖顶栏
//     最左侧的按钮），所以 hover 意图必须由 JS 统一管理：
//     mouseover 冒泡判断 + mouseout 时看 relatedTarget，
//     不能只靠 CSS :hover（那样指针一移进浮层就会被判定为"离开"）。
//  3. 悬停后延迟 90ms 再显示由**父级**用 onHoverIntent 统一处理；
//     收起延迟 200ms 由本组件内部兜底（避免鼠标在按钮与浮层之间移动时闪断）。
//  4. 内容是左侧栏的**只读镜像**，数据全部来自真实 store / 会话偏好 /
//     归档状态，绝不写死任何会话名或项目名。
//
// 未镜像的部分（有意为之，见各处中文注释）：子智能体树、文件树、
// 「打开工作区」选择器、归档模式切换、每行「更多操作」菜单。

import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Component,
  type JSX,
} from "solid-js"
import { Portal } from "solid-js/web"
import { ChevronRight, Folder, Pin, Plus, Store } from "lucide-solid"
import { useApp } from "../../lib/store/provider"
import { useSessionPreferences } from "../../lib/session-preferences"
import { useSessionArchive } from "../../lib/session-archive"
import { shellSidebarWidth } from "../../lib/shell-layout"
import { LAYERS } from "../../lib/ui/layers"

/** 父级据此实现 hover-intent：悬停 90ms 后才置 open=true。 */
export const SIDEBAR_FLYOUT_SHOW_DELAY = 90
/** 收起前的缓冲，避免指针在触发按钮与浮层之间移动时闪断。 */
export const SIDEBAR_FLYOUT_HIDE_DELAY = 200

/** 浮层固定定位：距左 10px，上下各留 9px。 */
const FLYOUT_LEFT = 10
const FLYOUT_INSET = 9

export interface SidebarFlyoutProps {
  open: boolean
  /** 浮层内任意位置被点击 → 真正展开左侧栏。 */
  onOpen: () => void
  /** 左侧栏宽度；缺省时由 shellSidebarWidth 兜底 240。 */
  width?: number
  /** 触控端无 hover：由父级点按直接置 true（置位后组件忽略一切 hover 意图）。 */
  touch?: boolean
  /**
   * 悬停意图回调：true = 请求显示（父级负责 90ms 延迟），
   * false = 请求收起（父级直接置 false 即可）。
   */
  onHoverIntent?: (show: boolean) => void
  /**
   * 可选：把触发按钮（主区顶栏「打开左侧栏」）作为子节点放入，
   * 组件会在它外面挂一层 display:contents 的包裹元素接收悬停事件。
   * 不传时由父级自己在按钮上调用 onHoverIntent。
   */
  children?: JSX.Element
}

interface SessionGroup {
  key: string
  label: string
  ids: string[]
}

/** 目录显示名：取路径最后一段（与 left-nav 的 dirLabel 行为一致）。 */
function dirLabel(dir: string | undefined): string {
  if (!dir) return "未分类"
  const parts = dir.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? dir
}

/** 按目录分组会话（真实目录字段，无任何写死数据）。 */
function groupByDirectory(sessionIDs: string[], dirOf: (id: string) => string | undefined): SessionGroup[] {
  const order: string[] = []
  const map = new Map<string, SessionGroup>()
  for (const id of sessionIDs) {
    const key = dirOf(id) ?? ""
    let group = map.get(key)
    if (!group) {
      group = { key, label: dirLabel(dirOf(id)), ids: [] }
      map.set(key, group)
      order.push(key)
    }
    group.ids.push(id)
  }
  return order.map((key) => map.get(key)!)
}

/** 左栏固定的两个导航入口（与 left-nav 的 NAV_ITEMS 保持一致）。 */
const NAV_ITEMS = [
  { id: "tasks", icon: Plus, label: "新建任务" },
  { id: "plugins", icon: Store, label: "插件市场" },
] as const

export const SidebarFlyout: Component<SidebarFlyoutProps> = (p) => {
  const { store, activeProfile, connection } = useApp()
  const { displayTitle, isPinned, sortSessionIDs } = useSessionPreferences()
  const { isArchived } = useSessionArchive()

  let triggerEl: HTMLDivElement | undefined
  let panelEl: HTMLDivElement | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  // 指针是否仍在「触发按钮 + 浮层」这一整体内（浮层会盖住按钮，两者必须合并判断）。
  const [hovered, setHovered] = createSignal(false)
  // Escape 只请求父层关闭；若父层没及时翻转 open，本地先撤下，避免"关不掉"。
  const [dismissed, setDismissed] = createSignal(false)

  const sessionOf = (id: string) => store.store.sessions[id]
  const title = (id: string) => displayTitle(id, sessionOf(id)?.title)
  const dirOf = (id: string) => sessionOf(id)?.directory
  const sessionStatus = (id: string) => store.store.status[id]?.type

  /** 左栏当前展示的会话：按偏好排序 + 过滤已归档（与 workspace 的可见列表同源）。 */
  const visibleSessionIDs = createMemo(() =>
    sortSessionIDs(store.store.sessionOrder).filter((id) => !isArchived(id, dirOf(id))),
  )
  const groups = createMemo(() => groupByDirectory(visibleSessionIDs(), dirOf))
  const flyoutWidth = () => shellSidebarWidth("left", p.width)
  const visible = () => p.open && !dismissed()
  const statusText = () => {
    const state = connection().status
    if (state === "connected") return "已连接"
    if (state === "connecting") return "连接中"
    if (state === "error") return "连接异常"
    return "未连接"
  }
  const statusColor = () => {
    const state = connection().status
    if (state === "connected") return "bg-[var(--success)]"
    if (state === "connecting") return "bg-[var(--warning)] animate-pulse"
    if (state === "error") return "bg-[var(--error)]"
    return "bg-[var(--text-muted)]"
  }

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = undefined
    }
  }

  /** 指针进入触发区或浮层：取消收起计时，并请求显示。 */
  function enterHover() {
    if (p.touch) return
    clearHideTimer()
    // 新的悬停意图同时清掉 Escape 造成的本地撤下，否则父级未翻转 open 时浮层再也回不来。
    setDismissed(false)
    if (hovered()) return
    setHovered(true)
    p.onHoverIntent?.(true)
  }

  /** 指针离开整体：200ms 后才请求收起。 */
  function leaveHover() {
    if (p.touch) return
    clearHideTimer()
    if (!hovered()) return
    setHovered(false)
    hideTimer = setTimeout(() => {
      hideTimer = undefined
      p.onHoverIntent?.(false)
    }, SIDEBAR_FLYOUT_HIDE_DELAY)
  }

  /** 浮层被父级重新打开时复位「已用 Escape 撤下」的状态。 */
  createEffect(() => {
    if (p.open) setDismissed(false)
  })

  // Escape 关闭（两种关闭方式之一：移开鼠标 / Escape）。
  createEffect(() => {
    if (!p.open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      setDismissed(true)
      setHovered(false)
      clearHideTimer()
      p.onHoverIntent?.(false)
    }
    window.addEventListener("keydown", onKeyDown)
    onCleanup(() => window.removeEventListener("keydown", onKeyDown))
  })

  onCleanup(clearHideTimer)

  /** relatedTarget 判断：目标仍在元素内部时不算真正离开（覆盖内部子元素之间的移动）。 */
  function leftElement(event: MouseEvent, element: HTMLElement | undefined): boolean {
    if (!element) return true
    const next = event.relatedTarget
    return !(next instanceof Node && element.contains(next))
  }

  return (
    <>
      {/* 触发区包裹层：display:contents 不参与布局，只接收悬停事件。 */}
      <Show when={p.children}>
        <div
          ref={triggerEl}
          class="contents"
          onMouseEnter={enterHover}
          onMouseLeave={leaveHover}
          // 冒泡的 mouseover / mouseout 兜底：部分浏览器对 display:contents
          // 的 mouseenter 计算不一致，用 relatedTarget 做二次判断更稳。
          onMouseOver={(event) => {
            if (leftElement(event, triggerEl)) enterHover()
          }}
          onMouseOut={(event) => {
            if (leftElement(event, triggerEl)) leaveHover()
          }}
        >
          {p.children}
        </div>
      </Show>

      <Show when={visible()}>
        <Portal>
          <div
            ref={panelEl}
            class="fixed flex flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xl"
            style={{
              left: `${FLYOUT_LEFT}px`,
              top: `${FLYOUT_INSET}px`,
              bottom: `${FLYOUT_INSET}px`,
              width: `${flyoutWidth()}px`,
              "z-index": LAYERS.dropdown,
            }}
            role="dialog"
            aria-label="左侧栏预览"
            // 浮层内任意位置被点击都真正展开左侧栏。
            onClick={() => p.onOpen()}
            onMouseEnter={enterHover}
            onMouseLeave={leaveHover}
            onMouseOver={(event) => {
              if (leftElement(event, panelEl)) enterHover()
            }}
            onMouseOut={(event) => {
              if (leftElement(event, panelEl)) leaveHover()
            }}
          >
            {/* 品牌区 */}
            <div class="flex h-12 shrink-0 items-center border-b border-[var(--border-color)] px-3">
              <span class="text-sm font-bold text-[var(--text-primary)]">MiMoCodeUI</span>
            </div>

            {/* 固定导航入口（镜像 left-nav 的 NAV_ITEMS） */}
            <div class="flex shrink-0 flex-col gap-0.5 border-b border-[var(--border-color)] p-2">
              <For each={NAV_ITEMS}>
                {(item) => (
                  <div
                    class="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                    title={item.label}
                  >
                    <item.icon size={16} class="shrink-0" />
                    <span class="truncate">{item.label}</span>
                  </div>
                )}
              </For>
            </div>

            {/* 任务列表标题：左栏这里的「打开工作区」选择器与归档切换依赖
                工作区内部状态，预览里暂未镜像，只保留标题。 */}
            <div class="flex h-8 shrink-0 items-center px-3">
              <span class="min-w-0 truncate text-xs font-semibold text-[var(--text-secondary)]">任务列表</span>
              <span class="ml-auto shrink-0 text-[10px] text-[var(--text-muted)]">{visibleSessionIDs().length}</span>
            </div>

            {/* 会话列表（真实数据：store.sessionOrder + 偏好排序 + 归档过滤） */}
            <div class="min-h-0 flex-1 overflow-y-auto py-1">
              <For each={groups()}>
                {(group) => (
                  <section>
                    <div class="flex h-8 items-center gap-1.5 px-2 text-xs font-medium text-[var(--text-secondary)]">
                      <ChevronRight size={14} class="shrink-0" />
                      <Folder size={14} class="shrink-0" />
                      <span class="min-w-0 flex-1 truncate" title={group.label}>
                        {group.label}
                      </span>
                      <span class="shrink-0 text-[var(--text-muted)]">{group.ids.length}</span>
                    </div>
                    <For each={group.ids}>
                      {(id) => (
                        <div
                          class="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                          title={title(id)}
                        >
                          <Show
                            when={isPinned(id)}
                            fallback={
                              <span
                                class={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  sessionStatus(id) === "busy" ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"
                                }`}
                              />
                            }
                          >
                            <Pin size={13} class="shrink-0 text-[var(--accent)]" />
                          </Show>
                          <span class="min-w-0 flex-1 truncate">{title(id)}</span>
                        </div>
                      )}
                    </For>
                  </section>
                )}
              </For>
              <Show when={visibleSessionIDs().length === 0}>
                <p class="px-3 py-2 text-xs text-[var(--text-muted)]">暂无任务 · 点击预览可展开左侧栏</p>
              </Show>
            </div>

            {/* 底部账号区：左栏底部是 ContextFooter（依赖当前选中会话的上下文
                用量），预览拿不到活动会话，因此只镜像真实的服务器与连接状态。 */}
            <div class="flex min-h-12 shrink-0 items-center gap-2.5 border-t border-[var(--border-color)] px-3 py-2">
              <span class={`h-2 w-2 shrink-0 rounded-full ${statusColor()}`} />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="min-w-0 truncate text-xs text-[var(--text-primary)]">{activeProfile().name}</span>
                <span class="text-[10px] text-[var(--text-muted)]">{statusText()}</span>
              </span>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  )
}
