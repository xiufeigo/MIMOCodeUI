import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom"
import { createEffect, createMemo, For, onCleanup, Show, type Component } from "solid-js"
import { Portal } from "solid-js/web"
import { LAYERS } from "../../lib/ui/layers"
import { filterSlashCommands, type SlashCommand } from "./slash-commands"

export interface SlashCommandMenuProps {
  open: boolean
  /** 锚点（输入框 textarea）。 */
  reference: HTMLElement | null
  query: string
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
  onHover: (index: number) => void
  onClose: () => void
}

/**
 * `/` 快捷指令下拉菜单：锚定到输入框上方，不抢占输入框焦点，
 * 键盘上下/回车/Tab/Escape 由父级 textarea 的 onKeyDown 处理。
 */
export const SlashCommandMenu: Component<SlashCommandMenuProps> = (p) => {
  let el: HTMLDivElement | undefined
  let cleanup: (() => void) | undefined

  const commands = createMemo(() => filterSlashCommands(p.query))

  createEffect(() => {
    if (!p.open || !p.reference || !el) return
    cleanup = autoUpdate(p.reference, el, () => {
      if (!p.reference || !el) return
      void computePosition(p.reference, el, {
        placement: "top-start",
        middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        if (!el) return
        Object.assign(el.style, { left: `${x}px`, top: `${y}px` })
      })
    })
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (el?.contains(target) || p.reference?.contains(target)) return
      p.onClose()
    }
    document.addEventListener("pointerdown", onPointerDown)
    onCleanup(() => {
      cleanup?.()
      cleanup = undefined
      document.removeEventListener("pointerdown", onPointerDown)
    })
  })

  return (
    <Show when={p.open && p.reference}>
      <Portal>
        <div
          ref={el}
          class="fixed z-[60] max-h-72 w-72 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] py-1 shadow-xl"
          style={{ "z-index": LAYERS.dropdown }}
          role="listbox"
        >
          <Show
            when={commands().length > 0}
            fallback={<p class="px-3 py-2 text-xs text-[var(--text-muted)]">无匹配命令</p>}
          >
            <For each={commands()}>
              {(command, index) => (
                <button
                  class={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    index() === p.selectedIndex
                      ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)]"
                  }`}
                  role="option"
                  aria-selected={index() === p.selectedIndex}
                  onMouseEnter={() => p.onHover(index())}
                  onClick={() => p.onSelect(command)}
                >
                  <span class="shrink-0 font-mono text-xs text-[var(--accent)]">{command.command}</span>
                  <span class="min-w-0 flex-1 truncate text-[var(--text-muted)]">{command.description}</span>
                </button>
              )}
            </For>
          </Show>
        </div>
      </Portal>
    </Show>
  )
}
