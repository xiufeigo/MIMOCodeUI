// 左下角账号 / 设置浮层。
//
// 结构自上而下：品牌与账号区 → 分隔线 → 个人资料 / 设置 / 剩余用量 /
// 帮助与反馈 → 分隔线 → 退出登录。
//
// 为什么没有复用 overlay/anchored-menu：
//   AnchoredMenu 依赖 floating-ui 相对「触发元素」定位，并会铺一层全屏透明
//   遮罩处理点击外部。本浮层是固定贴左下角的（left 12 / bottom 60），没有
//   触发元素；而且全屏遮罩会盖住左下角的触发区、把它和浮层之间的 hover
//   打断，因此这里自己实现 Portal + 遮罩 + Escape + 焦点进入/归还。
//
// 行为约定：只有拿到明确回调的行（设置 / 退出登录）才是可点击菜单项；
// 「个人资料 / 剩余用量 / 帮助与反馈 / 订阅」本任务没有给出目标回调，
// 一律按只读行渲染，不臆造行为。

import { For, Show, createEffect, createMemo, onCleanup, type Component } from "solid-js"
import { Portal } from "solid-js/web"
import { CircleCheck, CircleHelp, LogOut, Server, Settings, User } from "lucide-solid"
import { LAYERS } from "../../lib/ui/layers"

/** 贴左下角定位：left 12px / bottom 60px / 宽 300px。 */
const MENU_LEFT = 12
const MENU_BOTTOM = 60
const MENU_WIDTH = 300

export interface AccountMenuProps {
  open: boolean
  /** 账号名；缺省时显示占位文案（不编造任何具体用户名）。 */
  accountName?: string
  onClose: () => void
  onOpenSettings: () => void
  onSignOut: () => void
}

interface MenuRow {
  label: string
  icon: Component<{ size?: number | string; class?: string }>
  /** 有回调才是可点击菜单项；没有回调的按只读行渲染。 */
  action?: "settings"
  /** 右侧附加内容：快捷键标签 / 订阅小按钮。 */
  trailing?: "shortcut" | "subscribe"
}

/** 菜单行统一样式：行高 32px，满足最小触控目标。 */
const ROW = "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm"
const ROW_ACTION = "cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
const ROW_ICON = "shrink-0 text-[var(--text-muted)]"
const ROW_TEXT = "min-w-0 flex-1 truncate text-left text-[var(--text-secondary)]"

/** 行尾内容：快捷键标签或订阅小按钮。 */
const RowTrailing: Component<{ kind?: MenuRow["trailing"] }> = (props) => (
  <>
    <Show when={props.kind === "shortcut"}>
      <kbd class="shrink-0 rounded border border-[var(--border-color)] bg-[var(--bg-raised)] px-1.5 py-0.5 font-sans text-[10px] text-[var(--text-muted)]">
        Ctrl+,
      </kbd>
    </Show>
    <Show when={props.kind === "subscribe"}>
      {/* 订阅入口本期未接入（没有对应回调 prop）：保持可见但不触发任何动作。 */}
      <button
        type="button"
        aria-disabled="true"
        title="订阅入口暂未接入"
        class="h-8 shrink-0 rounded-full border border-[var(--border-strong)] px-2.5 text-[11px] text-[var(--text-secondary)]"
      >
        订阅
      </button>
    </Show>
  </>
)

export const AccountMenu: Component<AccountMenuProps> = (p) => {
  let panelEl: HTMLDivElement | undefined
  let restoreFocus: HTMLElement | null = null

  const accountLabel = () => p.accountName?.trim() || "未获取到账号名"

  const rows = createMemo<MenuRow[]>(() => [
    { label: "个人资料", icon: User },
    { label: "设置", icon: Settings, action: "settings", trailing: "shortcut" },
    { label: "剩余用量", icon: CircleCheck, trailing: "subscribe" },
    { label: "帮助与反馈", icon: CircleHelp },
  ])

  // 打开时把焦点移到第一个可聚焦元素（设置行），关闭时归还焦点。
  createEffect(() => {
    if (!p.open) return
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    queueMicrotask(() => panelEl?.querySelector<HTMLElement>("button:not([disabled])")?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      p.onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown)
      restoreFocus?.focus()
      restoreFocus = null
    })
  })

  return (
    <Show when={p.open}>
      <Portal>
        {/* 点击外部关闭 */}
        <button
          class="fixed inset-0 cursor-default bg-transparent"
          style={{ "z-index": LAYERS.dropdown - 1 }}
          aria-label="关闭账号菜单"
          onClick={p.onClose}
        />
        <div
          ref={panelEl}
          class="fixed overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] py-1 shadow-2xl"
          style={{
            left: `${MENU_LEFT}px`,
            bottom: `${MENU_BOTTOM}px`,
            width: `${MENU_WIDTH}px`,
            "z-index": LAYERS.dropdown,
          }}
          role="group"
          aria-label="账号与设置"
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
            event.preventDefault()
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"))
            if (items.length === 0) return
            const index = items.indexOf(document.activeElement as HTMLButtonElement)
            const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length
            items[next]?.focus()
          }}
        >
          {/* 顶部浅色圆角区：品牌标识 + 账号名 + 三个小图标 + 「已登录」 */}
          <div class="mx-1.5 mb-1.5 rounded-xl bg-[var(--bg-raised)] p-3">
            <div class="flex items-center gap-2.5">
              {/* 品牌字标：纯文本字母，不用 emoji 也不用位图。 */}
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-surface)] text-sm font-bold text-[var(--accent)]">
                M
              </span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]">{accountLabel()}</span>
                <span class="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                  <CircleCheck size={11} class="shrink-0 text-[var(--accent)]" />
                  已登录
                </span>
              </span>
            </div>
            <div class="mt-2 flex items-center gap-1.5">
              {/* 三个小图标：账号、服务器、登录态，均为无歧义的状态图标。 */}
              <span class="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--bg-surface)]" title="账号">
                <User size={13} class={ROW_ICON} />
              </span>
              <span class="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--bg-surface)]" title="服务器">
                <Server size={13} class={ROW_ICON} />
              </span>
              <span class="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--bg-surface)]" title="登录状态">
                <CircleCheck size={13} class={ROW_ICON} />
              </span>
              <span class="ml-auto text-[10px] text-[var(--text-muted)]">MiMoCodeUI</span>
            </div>
          </div>

          {/* 分隔线 */}
          <div class="mx-1.5 my-1 border-t border-[var(--border-color)]" />

          <For each={rows()}>
            {(row) => (
              <Show
                when={row.action}
                fallback={
                  // 只读行：本任务没有给出目标动作，行内不挂任何点击处理。
                  <div class={`${ROW} cursor-default`} aria-disabled="true">
                    <row.icon size={16} class={ROW_ICON} />
                    <span class={ROW_TEXT}>{row.label}</span>
                    <RowTrailing kind={row.trailing} />
                  </div>
                }
              >
                <button
                  class={`${ROW} ${ROW_ACTION}`}
                  role="menuitem"
                  onClick={() => {
                    p.onOpenSettings()
                    // 动作触发后顺手收起，避免浮层压在下层界面之上。
                    p.onClose()
                  }}
                >
                  <row.icon size={16} class={ROW_ICON} />
                  <span class={ROW_TEXT}>{row.label}</span>
                  <RowTrailing kind={row.trailing} />
                </button>
              </Show>
            )}
          </For>

          {/* 分隔线 */}
          <div class="mx-1.5 my-1 border-t border-[var(--border-color)]" />

          <button
            class={`${ROW} ${ROW_ACTION}`}
            role="menuitem"
            onClick={() => {
              p.onSignOut()
              p.onClose()
            }}
          >
            <LogOut size={16} class={ROW_ICON} />
            <span class={ROW_TEXT}>退出登录</span>
          </button>
        </div>
      </Portal>
    </Show>
  )
}
