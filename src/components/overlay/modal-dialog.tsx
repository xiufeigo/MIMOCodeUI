import { createEffect, onCleanup, Show, type Component, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { LAYERS } from "../../lib/ui/layers"

interface ModalDialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: JSX.Element
  class?: string
}

/** Accessible modal foundation with Escape handling and focus restoration. */
export const ModalDialog: Component<ModalDialogProps> = (p) => {
  let dialogEl: HTMLDivElement | undefined
  let previousFocus: HTMLElement | null = null
  const titleID = `dialog-title-${Math.random().toString(36).slice(2)}`

  createEffect(() => {
    if (!p.open) return
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    queueMicrotask(() => dialogEl?.querySelector<HTMLElement>("input, button, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        p.onClose()
        return
      }
      if (event.key !== "Tab" || !dialogEl || event.defaultPrevented) return
      const focusable = Array.from(
        dialogEl.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"),
      )
      if (!focusable.length) return
      const current = focusable.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : current >= focusable.length - 1 ? 0 : current + 1
      event.preventDefault()
      focusable[next]?.focus()
    }
    window.addEventListener("keydown", onKeyDown)
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown)
      previousFocus?.focus()
      previousFocus = null
    })
  })

  return (
    <Show when={p.open}>
      <Portal>
        <div class="fixed inset-0 flex items-center justify-center bg-black/55 p-4" style={{ "z-index": LAYERS.modal }} onMouseDown={p.onClose}>
          <div
            ref={dialogEl}
            class={p.class ?? "w-full max-w-xl"}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleID}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id={titleID} class="sr-only">{p.title}</h2>
            {p.children}
          </div>
        </div>
      </Portal>
    </Show>
  )
}
