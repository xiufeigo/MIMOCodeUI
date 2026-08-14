import { createSignal, Show, type Component, type JSX } from "solid-js"
import { ChevronDown } from "lucide-solid"

export interface AccordionProps {
  title: string
  /** 数量徽标（可选）。 */
  count?: number
  /** 折叠态摘要（折叠时显示在标题右侧）。 */
  summary?: string
  defaultOpen?: boolean
  children: JSX.Element
}

/** 通用折叠区：标题 + 数量徽标 + 折叠箭头 + 内容。 */
export const Accordion: Component<AccordionProps> = (p) => {
  const [open, setOpen] = createSignal(p.defaultOpen ?? false)
  return (
    <div class="overflow-hidden rounded-md border border-[var(--border-color)]">
      <button
        class="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors hover:bg-[var(--bg-hover)]"
        onClick={() => setOpen(!open())}
        aria-expanded={open()}
      >
        <ChevronDown size={14} class={`shrink-0 text-[var(--text-muted)] transition-transform ${open() ? "rotate-180" : ""}`} />
        <span class="shrink-0 font-medium text-[var(--text-secondary)]">{p.title}</span>
        <Show when={p.count !== undefined}>
          <span class="shrink-0 rounded-full bg-[var(--bg-raised)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{p.count}</span>
        </Show>
        <Show when={p.summary && !open()}>
          <span class="min-w-0 flex-1 truncate text-right text-[10px] text-[var(--text-muted)]">{p.summary}</span>
        </Show>
      </button>
      <Show when={open()}>
        <div class="border-t border-[var(--border-color)] px-2.5 py-2">{p.children}</div>
      </Show>
    </div>
  )
}
