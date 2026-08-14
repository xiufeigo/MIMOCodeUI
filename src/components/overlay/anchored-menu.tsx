import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom"
import { createEffect, onCleanup, Show, type Component, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { LAYERS } from "../../lib/ui/layers"

interface AnchoredMenuProps {
  open: boolean
  reference: HTMLElement | null
  onClose: () => void
  children: JSX.Element
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end"
  ariaLabel: string
  /** Identifies the UI surface that owns this portaled menu. */
  owner?: string
}

/** Body-level anchored menu that escapes scroll clipping and flips at viewport edges. */
export const AnchoredMenu: Component<AnchoredMenuProps> = (p) => {
  let floatingEl: HTMLDivElement | undefined
  let restoreFocus: HTMLElement | null = null
  let cleanupPosition: (() => void) | undefined

  function updatePosition() {
    if (!p.reference || !floatingEl) return
    void computePosition(p.reference, floatingEl, {
      placement: p.placement ?? "bottom-end",
      middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      if (!floatingEl) return
      Object.assign(floatingEl.style, { left: `${x}px`, top: `${y}px` })
    })
  }

  createEffect(() => {
    if (!p.open || !p.reference || !floatingEl) return
    restoreFocus = p.reference
    cleanupPosition = autoUpdate(p.reference, floatingEl, updatePosition)
    queueMicrotask(() => floatingEl?.querySelector<HTMLElement>("button:not([disabled])")?.focus())
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
      restoreFocus?.focus()
      restoreFocus = null
    })
  })

  return (
    <Show when={p.open && p.reference}>
      <Portal>
        <button class="fixed inset-0 cursor-default bg-transparent" style={{ "z-index": LAYERS.dropdown - 1 }} aria-label="关闭菜单" onClick={p.onClose} />
        <div
          ref={floatingEl}
          class="fixed w-52 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] py-1 shadow-xl"
          style={{ "z-index": LAYERS.dropdown }}
          role="menu"
          aria-label={p.ariaLabel}
          data-overlay-owner={p.owner}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
            event.preventDefault()
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"))
            const index = items.indexOf(document.activeElement as HTMLButtonElement)
            const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length
            items[next]?.focus()
          }}
        >
          {p.children}
        </div>
      </Portal>
    </Show>
  )
}
