import { createSignal, createEffect, createMemo, For, Show, type Component } from "solid-js"
import { Check, ChevronDown } from "lucide-solid"
import { PopoverSurface } from "../overlay/popover-surface"
import { listSystemFonts } from "../../lib/system-fonts"

export interface FontPickerProps {
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

/**
 * 可输入 + 可搜索的字体选择下拉框。输入框既展示当前字体也用于输入关键词
 * 筛选；打开后默认列出系统全部字体，点击任意项或回车提交自定义值。
 */
export const FontPicker: Component<FontPickerProps> = (p) => {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [fonts, setFonts] = createSignal<string[]>([])
  let trigger: HTMLInputElement | undefined

  // 首次打开时拉取系统字体（之后缓存，避免每次展开都读注册表）。
  createEffect(() => {
    if (!open()) return
    if (fonts().length === 0) {
      void listSystemFonts().then(setFonts)
    }
  })

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase()
    const all = fonts()
    if (!q) return all
    return all.filter((f) => f.toLowerCase().includes(q))
  })

  /** 输入框显示值：收起时显示当前字体，展开时显示搜索关键词。 */
  const display = () => (open() ? query() : p.value)

  function commit(value: string) {
    p.onChange(value)
    setOpen(false)
    setQuery("")
  }

  function openWithAll() {
    setQuery("")
    setOpen(true)
  }

  return (
    <>
      <div class="relative">
        <input
          ref={trigger}
          class="w-44 rounded-md border border-[var(--set-border-soft)] bg-[var(--set-input-bg)] px-2 py-1 pr-7 text-sm text-[var(--set-text)] outline-none placeholder:text-neutral-400 hover:border-[var(--set-accent-soft)] focus:border-[var(--accent)]"
          placeholder={p.placeholder ?? "搜索或输入字体名…"}
          value={display()}
          onFocus={() => {
            if (!open()) openWithAll()
          }}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              setOpen(false)
              setQuery("")
            } else if (e.key === "Enter") {
              e.preventDefault()
              const q = query().trim()
              commit(q || p.value)
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          class="absolute inset-y-0 right-0 flex w-6 items-center justify-center text-[var(--set-text-muted)]"
          onClick={() => (open() ? setOpen(false) : openWithAll())}
          aria-label="切换字体列表"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      <PopoverSurface
        open={open()}
        reference={trigger ?? null}
        onClose={() => {
          setOpen(false)
          setQuery("")
        }}
        width={240}
        align="start"
        autoFocus={false}
        theme="light"
      >
        <div class="max-h-64 min-w-0 overflow-y-auto py-1">
          <Show when={fonts().length === 0}>
            <p class="px-3 py-2 text-xs text-[var(--set-text-muted)]">正在加载系统字体…</p>
          </Show>
          <Show when={fonts().length > 0 && filtered().length === 0}>
            <p class="px-3 py-2 text-xs text-[var(--set-text-muted)]">无匹配字体，回车可用「{query()}」</p>
          </Show>
          <For each={filtered().slice(0, 200)}>
            {(font) => (
              <button
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--set-text-secondary)] hover:bg-[var(--set-hover)]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(font)}
                style={{ "font-family": `"${font}", system-ui` }}
              >
                <span class="min-w-0 flex-1 truncate">{font}</span>
                <Show when={font === p.value}>
                  <Check size={13} class="shrink-0 text-[var(--accent)]" />
                </Show>
              </button>
            )}
          </For>
        </div>
      </PopoverSurface>
    </>
  )
}
