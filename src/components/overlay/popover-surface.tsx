import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom"
import { createEffect, onCleanup, Show, type Component, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { LAYERS } from "../../lib/ui/layers"

interface PopoverSurfaceProps {
  open: boolean
  /** 定位锚点（触发按钮）。 */
  reference: HTMLElement | null
  onClose: () => void
  children: JSX.Element
  width?: number
  align?: "start" | "end"
  /** 打开后是否把焦点交给弹层内首个可聚焦元素（输入类弹层可关掉）。 */
  autoFocus?: boolean
  /** light：白色设置弹窗内的浅色浮层（settings-light 令牌作用域）。 */
  theme?: "default" | "light"
}

/**
 * 轻量 anchored popover：Portal + outside click + Escape + 焦点进入/恢复，
 * 并做视口边界避让。用于新建任务的服务端菜单和目录菜单，保证两者能互斥失焦。
 */
export const PopoverSurface: Component<PopoverSurfaceProps> = (p) => {
  let el: HTMLDivElement | undefined
  let triggerEl: HTMLElement | null = null
  let cleanupPosition: (() => void) | undefined

  function reposition() {
    if (!el || !triggerEl) return
    const width = p.width ?? 256
    el.style.width = `${width}px`
    void computePosition(triggerEl, el, {
      placement: p.align === "end" ? "bottom-end" : "bottom-start",
      middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      if (!el) return
      Object.assign(el.style, { left: `${x}px`, top: `${y}px` })
    })
  }

  createEffect(() => {
    if (!p.open || !p.reference || !el) return
    triggerEl = p.reference
    cleanupPosition = autoUpdate(p.reference, el, reposition)
    queueMicrotask(() => {
      reposition()
      if (p.autoFocus !== false) {
        el?.querySelector<HTMLElement>("button:not([disabled]), input, select, textarea")?.focus()
      }
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      p.onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    onCleanup(() => {
      cleanupPosition?.()
      cleanupPosition = undefined
      window.removeEventListener("keydown", onKeyDown)
      triggerEl?.focus()
      triggerEl = null
    })
  })

  return (
    <Show when={p.open && p.reference}>
      <Portal>
        <button class="fixed inset-0 cursor-default bg-transparent" style={{ "z-index": LAYERS.dropdown - 1 }} aria-label="关闭菜单" onClick={p.onClose} />
        <div
          ref={el}
          class={
            p.theme === "light"
              ? "settings-light fixed overflow-hidden rounded-lg border border-[var(--set-border)] bg-[var(--set-card)] py-1 shadow-xl"
              : "fixed overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] py-1 shadow-xl"
          }
          style={{ "z-index": LAYERS.dropdown }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {p.children}
        </div>
      </Portal>
    </Show>
  )
}
