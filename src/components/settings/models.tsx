import { createMemo, createSignal, For, Show, type Component } from "solid-js"
import { Search, X } from "lucide-solid"
import { useSettings } from "../../lib/settings/store"
import type { ModelInfo, ProviderInfo } from "../../lib/protocol/types"
import { Row, Toggle, providerColor } from "./ui"

export interface SettingsModelsProps {
  providers: ProviderInfo[]
  /** 默认模型（providerID/modelID），可选。 */
  defaultModels?: string[]
}

interface ModelEntry {
  prov: ProviderInfo
  model: ModelInfo
  key: string
  label: string
}

interface ProviderGroup {
  prov: ProviderInfo
  items: ModelEntry[]
}

/**
 * 模型 Tab（OpenCode 桌面版风格）：
 * - 顶部搜索框：按 名称/ID 过滤模型；
 * - 搜索命中后提供「全部选中 / 全部反选」一键批量启用/禁用搜索结果；
 * - 每个供应商分块卡片头部提供该供应商全部模型的「全部选中 / 全部反选」；
 * - 每模型「显示/隐藏」开关（localStorage，过滤会话头部的模型下拉）。
 */
export const SettingsModels: Component<SettingsModelsProps> = (p) => {
  const { isModelVisible, toggleModelVisibility, setModelsVisibility } = useSettings()
  const [query, setQuery] = createSignal("")

  const providers = () => p.providers ?? []

  const q = () => query().trim().toLowerCase()

  /** 单个模型是否命中搜索。 */
  function matches(key: string, label: string): boolean {
    if (!q()) return true
    return key.toLowerCase().includes(q()) || label.toLowerCase().includes(q())
  }

  /** 搜索命中结果（用于「全部选中/反选」批量操作）。 */
  const matchedKeys = createMemo(() => {
    const keys: string[] = []
    for (const prov of providers()) {
      for (const model of Object.values(prov.models ?? {})) {
        const key = `${model.providerID ?? prov.id}/${model.id}`
        if (matches(key, model.name ?? model.id)) keys.push(key)
      }
    }
    return keys
  })

  /** 按供应商分组（搜索时组内仅保留命中项，空组整体隐藏）。 */
  const groups = createMemo<ProviderGroup[]>(() => {
    const out: ProviderGroup[] = []
    for (const prov of providers()) {
      const items: ModelEntry[] = []
      for (const model of Object.values(prov.models ?? {})) {
        const key = `${model.providerID ?? prov.id}/${model.id}`
        const label = model.name ?? model.id
        if (matches(key, label)) items.push({ prov, model, key, label })
      }
      if (items.length > 0) out.push({ prov, items })
    }
    return out
  })

  /** 某供应商的全部模型 key（含未命中搜索的项）。 */
  function providerKeys(prov: ProviderInfo): string[] {
    return Object.values(prov.models ?? {}).map((model) => `${model.providerID ?? prov.id}/${model.id}`)
  }

  /** 搜索命中项中是否有任一模型已启用（决定批量开关的状态）。 */
  const anyMatchedVisible = () => matchedKeys().some((key) => isModelVisible(key))

  return (
    <div class="flex h-full min-h-0 flex-col">
      {/* 搜索 + 批量开关：固定在最上，滚动模型列表不影响其位置 */}
      <div class="shrink-0 pb-3">
        {/* 搜索 */}
        <div class="relative mb-3">
          <Search size={15} class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400" />
          <input
            class="w-full rounded-lg border border-[var(--set-border)] bg-white py-1.5 pr-8 pl-8.5 text-sm text-[var(--set-text)] outline-none placeholder:text-neutral-400 focus:border-[var(--accent)]"
            placeholder="搜索模型…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <Show when={query() !== ""}>
            <button
              class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600"
              title="清除搜索"
              onClick={() => setQuery("")}
            >
              <X size={14} />
            </button>
          </Show>
        </div>

        {/* 搜索命中批量开关：有任一启用即亮，点击关闭=全部反选，点击开启=全部选中 */}
        <Show when={q() !== ""}>
          <div class="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--set-border)] bg-[var(--set-accent-tint)] px-3 py-2">
            <span class="text-xs text-[var(--set-text-secondary)]">搜索到 {matchedKeys().length} 个匹配模型</span>
            <div class="flex shrink-0 items-center gap-2">
              <span class="text-[10px] text-[var(--set-text-muted)]">{anyMatchedVisible() ? "全部启用" : "全部禁用"}</span>
              <Toggle
                checked={anyMatchedVisible()}
                onChange={(v) => setModelsVisibility(matchedKeys(), v)}
                aria-label="启用/禁用全部匹配模型"
              />
            </div>
          </div>
        </Show>
      </div>

      {/* 模型列表：独立滚动区域 */}
      <div class="min-h-0 flex-1 overflow-y-auto">
        {/* 供应商分组卡片 */}
        <For each={groups()}>
          {(group) => {
            /** 该供应商显示项中是否有任一模型已启用（决定头部开关状态）。 */
            const anyVisible = () => group.items.some((entry) => isModelVisible(entry.key))
            return (
              <div class="mb-3 overflow-hidden rounded-xl border border-[var(--set-border)] bg-white shadow-sm">
                <div class="flex items-center justify-between gap-2 border-b border-[var(--set-border)] bg-[var(--set-accent-tint)] px-3.5 py-2">
                  <div class="flex min-w-0 items-center gap-2">
                    <span
                      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: providerColor(group.prov.id) }}
                    >
                      {(group.prov.name || group.prov.id).slice(0, 1).toUpperCase()}
                    </span>
                    <span class="truncate text-xs font-semibold text-[var(--set-accent-text)]">{group.prov.name}</span>
                    <span class="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] text-[var(--set-text-secondary)]">
                      {Object.keys(group.prov.models ?? {}).length}
                    </span>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <span class="text-[10px] text-[var(--set-text-muted)]">全部</span>
                    <Toggle
                      checked={anyVisible()}
                      onChange={(v) => setModelsVisibility(providerKeys(group.prov), v)}
                      aria-label={`启用/禁用 ${group.prov.name} 的全部模型`}
                    />
                  </div>
                </div>
                <div class="px-3.5">
                  <For each={group.items}>
                    {(entry) => {
                      const visible = () => isModelVisible(entry.key)
                      return (
                        <Row
                          title={entry.label}
                          description={
                            entry.key +
                            (p.defaultModels?.includes(entry.key) ? " · 默认" : "") +
                            (entry.model.status && entry.model.status !== "active" ? ` · ${entry.model.status}` : "")
                          }
                        >
                          <div class="flex items-center gap-2">
                            <Show when={!visible()}>
                              <span class="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500">已隐藏</span>
                            </Show>
                            <Toggle checked={visible()} onChange={() => toggleModelVisibility(entry.key)} />
                          </div>
                        </Row>
                      )
                    }}
                  </For>
                </div>
              </div>
            )
          }}
        </For>

        <Show when={providers().length === 0}>
          <p class="py-6 text-center text-sm text-[var(--set-text-muted)]">未连接服务器，无法加载模型列表。</p>
        </Show>
        <Show when={providers().length > 0 && groups().length === 0}>
          <p class="py-6 text-center text-sm text-[var(--set-text-muted)]">没有匹配「{query()}」的模型。</p>
        </Show>
      </div>
    </div>
  )
}
