import { createEffect, createSignal, For, Show, type Component } from "solid-js"
import { Check, Monitor, Moon, Settings, Sun, Trash2 } from "lucide-solid"
import { useApp, useClient } from "../../lib/store/provider"
import { useSettings } from "../../lib/settings/store"
import { PopoverSurface } from "../overlay/popover-surface"
import { Accordion } from "./accordion"
import type { GlobalConfig } from "../../lib/protocol/types"

export interface ContextFooterProps {
  active: string | null
  expanded: boolean
  onOpenSettings?: () => void
}

const R = 9
const CIRC = 2 * Math.PI * R

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** 插件数组条目 → 插件名。 */
function pluginName(entry: string | [string, unknown]): string {
  return Array.isArray(entry) ? String(entry[0]) : String(entry)
}

/**
 * 左栏底部上下文指示器（OpenCodeUI 风格）：圆环显示当前会话上下文占用百分比，
 * 点击弹出面板，含上下文统计、外观三态、服务器折叠框、插件/MCP/LSP 横向三
 * 标签页（点击向下展开内容，空列表显示「已根据文件类型自动检测」）、打开设置。
 */
export const ContextFooter: Component<ContextFooterProps> = (p) => {
  const { store, connection, profiles, activeProfile, setActiveProfile } = useApp()
  const client = useClient()
  const { settings, set } = useSettings()
  const [open, setOpen] = createSignal(false)
  const [config, setConfig] = createSignal<GlobalConfig | null>(null)
  const [toolsTab, setToolsTab] = createSignal<"plugin" | "mcp" | "lsp" | null>(null)
  let buttonEl: HTMLButtonElement | undefined

  const tokens = () => {
    if (!p.active) return undefined
    for (const m of store.sessionMessages(p.active)) {
      if (m.info?.role === "assistant") return m.info.tokens
    }
    return undefined
  }
  const inputTokens = () => tokens()?.input ?? 0
  /** 动态读取当前会话模型的上下文窗口（未知时兜底 0）。 */
  const contextLimit = () => (p.active ? store.contextLimit(p.active) : 0)
  const pct = () => {
    const limit = contextLimit()
    if (limit <= 0) return 0
    return Math.min(100, Math.round((inputTokens() / limit) * 100))
  }

  const ringColor = () => {
    const v = pct()
    if (v === 0) return "var(--text-muted)"
    if (v >= 90) return "var(--error)"
    if (v >= 70) return "var(--warning)"
    return "var(--accent)"
  }
  const statusColor = () => {
    const s = connection().status
    if (s === "connected") return "bg-[var(--success)]"
    if (s === "connecting") return "bg-[var(--warning)] animate-pulse"
    if (s === "error") return "bg-[var(--error)]"
    return "bg-[var(--text-muted)]"
  }

  const schemeOptions = [
    { value: "system", label: "跟随系统", icon: Monitor },
    { value: "light", label: "浅色", icon: Sun },
    { value: "dark", label: "深色", icon: Moon },
  ] as const

  // 弹窗打开且已连接时拉取服务器 config（MCP/LSP/插件）。
  createEffect(() => {
    if (!open()) return
    const c = client()
    if (!c || connection().status !== "connected") return
    void c.getGlobalConfig().then(setConfig).catch(() => setConfig(null))
  })

  async function patchConfig(patch: Partial<GlobalConfig>) {
    const c = client()
    if (!c) return
    await c.patchGlobalConfig(patch)
    void c.getGlobalConfig().then(setConfig).catch(() => {})
  }

  // ---- 插件 ----
  const plugins = () => (config()?.plugin ?? []).map(pluginName)
  function togglePlugin(name: string) {
    const cur = config()?.plugin ?? []
    const has = plugins().includes(name)
    const next = has ? cur.filter((e) => pluginName(e) !== name) : [...cur, name]
    void patchConfig({ plugin: next })
  }

  // ---- MCP ----
  const mcpEntries = () => Object.entries(config()?.mcp ?? {})
  function toggleMcp(name: string) {
    const cur = config()?.mcp ?? {}
    const entry = cur[name]
    const enabled = typeof entry === "object" && entry !== null && (entry as { enabled?: boolean }).enabled !== false
    void patchConfig({ mcp: { ...cur, [name]: { ...(entry ?? {}), enabled: !enabled } } })
  }

  // ---- LSP ----
  const lspRecord = () => {
    const l = config()?.lsp
    if (typeof l === "object" && l !== null) return l as Record<string, { disabled?: boolean }>
    return {}
  }
  function toggleLsp(name: string) {
    const cur = lspRecord()
    const entry = cur[name] ?? {}
    void patchConfig({ lsp: { ...cur, [name]: { ...entry, disabled: !(entry.disabled === true) } } })
  }

  const toolsCount = (tab: "plugin" | "mcp" | "lsp") => {
    if (tab === "plugin") return plugins().length
    if (tab === "mcp") return mcpEntries().length
    return Object.keys(lspRecord()).length
  }

  return (
    <div class={`flex shrink-0 items-center border-t border-[var(--border-color)] p-2 ${p.expanded ? "gap-2.5" : "flex-col gap-1.5"}`}>
      <button
        ref={(el) => (buttonEl = el)}
        class={`flex min-w-0 items-center gap-2.5 rounded-md p-1 text-left transition-colors hover:bg-[var(--bg-hover)] ${p.expanded ? "flex-1" : ""}`}
        title={`上下文：${formatTokens(inputTokens())} / ${formatTokens(contextLimit())} · ${pct()}%`}
        aria-label="上下文与设置"
        onClick={() => setOpen(!open())}
      >
        <span class="relative shrink-0">
          <svg viewBox="0 0 24 24" class="h-6 w-6 -rotate-90">
            <circle cx="12" cy="12" r={R} fill="none" stroke="var(--bg-raised)" stroke-width="3" />
            <circle
              cx="12"
              cy="12"
              r={R}
              fill="none"
              stroke={ringColor()}
              stroke-width="3"
              stroke-linecap="round"
              stroke-dasharray={String(CIRC)}
              stroke-dashoffset={String(CIRC * (1 - pct() / 100))}
              style={{ transition: "stroke-dashoffset 300ms" }}
            />
          </svg>
          <span class={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg-app)] ${statusColor()}`} />
        </span>
        <Show when={p.expanded}>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="font-mono text-xs text-[var(--text-secondary)]">
              {formatTokens(inputTokens())} / {formatTokens(contextLimit())}
            </span>
            <span class="text-[10px]" style={{ color: ringColor() }}>{pct()}%</span>
          </span>
        </Show>
      </button>

      <Show when={p.expanded}>
        <button
          class="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          title="设置"
          aria-label="设置"
          onClick={() => p.onOpenSettings?.()}
        >
          <Settings size={15} />
        </button>
      </Show>

      <PopoverSurface open={open()} reference={buttonEl ?? null} onClose={() => setOpen(false)} width={340} align="start">
        <div class="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-3">
          {/* 上下文统计 */}
          <div>
            <div class="mb-1 flex items-center justify-between">
              <span class="text-xs font-medium text-[var(--text-secondary)]">上下文</span>
              <span class="text-[10px]" style={{ color: ringColor() }}>{pct()}%</span>
            </div>
            <div class="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-raised)]">
              <div class="h-full rounded-full" style={{ width: `${pct()}%`, background: ringColor(), transition: "width 300ms" }} />
            </div>
            <p class="font-mono text-[10px] text-[var(--text-muted)]">
              {formatTokens(inputTokens())} / {formatTokens(contextLimit())} tokens
            </p>
          </div>

          {/* 外观 */}
          <div>
            <p class="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">外观</p>
            <div class="grid grid-cols-3 gap-1 rounded-md bg-[var(--bg-raised)] p-0.5">
              <For each={schemeOptions}>
                {(opt) => (
                  <button
                    class={`flex flex-col items-center gap-0.5 rounded px-1 py-1.5 text-[10px] transition-colors ${
                      settings().colorScheme === opt.value
                        ? "bg-[var(--bg-surface)] text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                    title={opt.label}
                    onClick={() => set("colorScheme", opt.value)}
                  >
                    <opt.icon size={14} />
                    <span>{opt.label}</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* 选择服务器（折叠框） */}
          <Accordion title="服务器" count={profiles().length} summary={activeProfile().name}>
            <div class="flex flex-col gap-0.5">
              <For each={profiles()}>
                {(profile) => (
                  <button
                    class="flex items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    onClick={() => {
                      setOpen(false)
                      void setActiveProfile(profile.id)
                    }}
                  >
                    <span class="min-w-0 flex-1 truncate">{profile.name}</span>
                    <Show when={profile.id === activeProfile().id}>
                      <Check size={13} class="shrink-0 text-[var(--accent)]" />
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Accordion>

          {/* 插件 / MCP / LSP：横向三个小按钮，点击向下展开内容 */}
          <div>
            <div class="grid grid-cols-3 gap-1 rounded-md bg-[var(--bg-raised)] p-0.5">
              {(
                [
                  ["plugin", "插件"],
                  ["mcp", "MCP"],
                  ["lsp", "LSP"],
                ] as const
              ).map(([id, label]) => (
                <button
                  class={`flex items-center justify-center gap-1 rounded px-1 py-1.5 text-[10px] transition-colors ${
                    toolsTab() === id
                      ? "bg-[var(--bg-surface)] font-medium text-[var(--accent)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                  onClick={() => setToolsTab(toolsTab() === id ? null : id)}
                  aria-expanded={toolsTab() === id}
                >
                  {label}
                  <span class="rounded-full bg-[var(--bg-hover)] px-1 py-px text-[9px] text-[var(--text-muted)]">{toolsCount(id)}</span>
                </button>
              ))}
            </div>

            {/* 展开内容（向下展开） */}
            <Show when={toolsTab()}>
              <div class="mt-1.5 rounded-md border border-[var(--border-color)] px-2.5 py-2">
                {/* 插件 */}
                <Show when={toolsTab() === "plugin"}>
                  <Show
                    when={plugins().length > 0}
                    fallback={<p class="px-1.5 py-1 text-xs text-[var(--text-muted)]">已根据文件类型自动检测 插件</p>}
                  >
                    <div class="flex flex-col gap-1">
                      <For each={plugins()}>
                        {(name) => (
                          <div class="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-[var(--text-secondary)]">
                            <span class="min-w-0 flex-1 truncate">{name}</span>
                            <button
                              class="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--error)]"
                              title="移除插件"
                              onClick={() => togglePlugin(name)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </Show>

                {/* MCP */}
                <Show when={toolsTab() === "mcp"}>
                  <Show
                    when={mcpEntries().length > 0}
                    fallback={<p class="px-1.5 py-1 text-xs text-[var(--text-muted)]">已根据文件类型自动检测 mcp</p>}
                  >
                    <div class="flex flex-col gap-1">
                      <For each={mcpEntries()}>
                        {([name, entry]) => {
                          const enabled = () =>
                            typeof entry === "object" && entry !== null && (entry as { enabled?: boolean }).enabled !== false
                          return (
                            <div class="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-[var(--text-secondary)]">
                              <button
                                class={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${enabled() ? "bg-[var(--accent)]" : "bg-[var(--bg-hover)]"}`}
                                onClick={() => toggleMcp(name)}
                                role="switch"
                                aria-checked={enabled()}
                              >
                                <span
                                  class={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${enabled() ? "translate-x-3.5" : "translate-x-0.5"}`}
                                />
                              </button>
                              <span class="min-w-0 flex-1 truncate">{name}</span>
                            </div>
                          )
                        }}
                      </For>
                    </div>
                  </Show>
                </Show>

                {/* LSP */}
                <Show when={toolsTab() === "lsp"}>
                  <Show
                    when={Object.keys(lspRecord()).length > 0}
                    fallback={<p class="px-1.5 py-1 text-xs text-[var(--text-muted)]">已根据文件类型自动检测 lsp</p>}
                  >
                    <div class="flex flex-col gap-1">
                      <For each={Object.entries(lspRecord())}>
                        {([name, entry]) => {
                          const disabled = () => entry?.disabled === true
                          return (
                            <div class="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-[var(--text-secondary)]">
                              <button
                                class={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${disabled() ? "bg-[var(--bg-hover)]" : "bg-[var(--accent)]"}`}
                                onClick={() => toggleLsp(name)}
                                role="switch"
                                aria-checked={!disabled()}
                              >
                                <span
                                  class={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${disabled() ? "translate-x-0.5" : "translate-x-3.5"}`}
                                />
                              </button>
                              <span class="min-w-0 flex-1 truncate">{name}</span>
                            </div>
                          )
                        }}
                      </For>
                    </div>
                  </Show>
                </Show>
              </div>
            </Show>
          </div>

          {/* 设置 */}
          <button
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            onClick={() => {
              setOpen(false)
              p.onOpenSettings?.()
            }}
          >
            <Settings size={14} />
            <span>打开设置</span>
          </button>
        </div>
      </PopoverSurface>
    </div>
  )
}
