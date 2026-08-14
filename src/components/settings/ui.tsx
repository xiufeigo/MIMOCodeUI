import { For, type Component, type JSX } from "solid-js"

/** 行：标题 + 描述在左，控件在右；浅色分块卡片内部使用。 */
export const Row: Component<{ title: string; description?: string; children: JSX.Element }> = (p) => (
  <div class="flex items-center justify-between gap-4 border-b border-[var(--set-border-soft)] py-2.5 last:border-b-0">
    <div class="min-w-0">
      <p class="text-sm text-[var(--set-text)]">{p.title}</p>
      {p.description ? <p class="mt-0.5 text-xs text-[var(--set-text-muted)]">{p.description}</p> : null}
    </div>
    <div class="shrink-0">{p.children}</div>
  </div>
)

/**
 * 分块卡片（OpenCode 风格）：主题色描边圆角矩形，头部为主题色浅色底 +
 * 主题色标题，正文为白底分隔行。
 */
export const Section: Component<{ title: string; action?: JSX.Element; children: JSX.Element }> = (p) => (
  <div class="mb-4 overflow-hidden rounded-xl border border-[var(--set-border)] bg-[var(--set-card)] shadow-sm">
    <div class="flex items-center justify-between gap-2 border-b border-[var(--set-border)] bg-[var(--set-accent-tint)] px-3.5 py-2">
      <h3 class="truncate text-xs font-semibold uppercase tracking-wide text-[var(--set-accent-text)]">{p.title}</h3>
      {p.action}
    </div>
    <div class="px-3.5">{p.children}</div>
  </div>
)

export const Toggle: Component<{ checked: boolean; onChange: (v: boolean) => void }> = (p) => (
  <button
    role="switch"
    aria-checked={p.checked}
    class={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${p.checked ? "bg-[var(--accent)]" : "bg-neutral-300"}`}
    onClick={() => p.onChange(!p.checked)}
  >
    <span
      class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
      style={{ transform: p.checked ? "translateX(16px)" : "none" }}
    />
  </button>
)

export const Select: Component<{
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}> = (p) => (
  <select
    class="rounded-md border border-[var(--set-border-soft)] bg-[var(--set-input-bg)] px-2 py-1 text-sm text-[var(--set-text)] outline-none hover:border-[var(--set-accent-soft)] focus:border-[var(--accent)]"
    value={p.value}
    onChange={(e) => p.onChange(e.currentTarget.value)}
  >
    <For each={p.options}>
      {(o) => <option value={o.value}>{o.label}</option>}
    </For>
  </select>
)

/** 提供商头像调色板（稳定按 id 哈希取色）。 */
const PROVIDER_COLORS = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#84cc16",
]

export function providerColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return PROVIDER_COLORS[Math.abs(hash) % PROVIDER_COLORS.length]
}

/** 通用浅色输入框样式。 */
export const INPUT_CLASS =
  "rounded-md border border-[var(--set-border-soft)] bg-[var(--set-input-bg)] px-2.5 py-1.5 text-sm text-[var(--set-text)] outline-none placeholder:text-neutral-400 hover:border-[var(--set-accent-soft)] focus:border-[var(--accent)]"

/** 通用小按钮样式（次要操作）。 */
export const BTN_CLASS =
  "rounded-md border border-[var(--set-border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--set-text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--set-accent-text)] disabled:opacity-50"

/** 主题色主按钮。 */
export const PRIMARY_BTN_CLASS =
  "rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
