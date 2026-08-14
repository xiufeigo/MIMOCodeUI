import { createSignal, For, Show, type Component } from "solid-js"
import { Plug, Search } from "lucide-solid"
import { useClient } from "../../lib/store/provider"
import type { GlobalConfig, ProviderInfo, ProviderList } from "../../lib/protocol/types"
import { BTN_CLASS, INPUT_CLASS, PRIMARY_BTN_CLASS, Section, providerColor } from "./ui"

export interface SettingsProvidersProps {
  /** Provider list with auth state from GET /provider. */
  list?: ProviderList | null
  /** Global config (for provider config / disabled_providers). */
  config?: GlobalConfig | null
  onReload: () => void
}

/**
 * 热门提供商（照抄 opencode use-providers.ts 的 popularProviders，按 MiMo 生态映射）。
 */
const POPULAR_PROVIDER_IDS = [
  "opencode",
  "anthropic",
  "github-copilot",
  "openai",
  "google",
  "openrouter",
  "vercel",
  "mimo",
]

/** 提供商来源 → 标签（照抄 opencode type() 逻辑）。 */
function sourceLabel(source: string | undefined, isConfigCustom: boolean): string {
  if (source === "env") return "环境变量"
  if (source === "api") return "API 密钥"
  if (source === "config") return isConfigCustom ? "自定义" : "配置"
  if (source === "custom") return "自定义"
  return "其他"
}

/**
 * 提供商 Tab（照抄 opencode settings-v2/providers.tsx + 桌面版卡片视觉）：
 * 两个分组「已连接」与「热门」，热门区底部为「自定义提供商」入口 +
 * 「查看全部提供商」（展开后带搜索）。无 HTTP 认证写入口（MiMo 服务端），
 * 连接/断开在界面上提示不可用。
 */
export const SettingsProviders: Component<SettingsProvidersProps> = (p) => {
  const client = useClient()
  const [name, setName] = createSignal("")
  const [baseUrl, setBaseUrl] = createSignal("")
  const [apiKey, setApiKey] = createSignal("")
  const [models, setModels] = createSignal("")
  const [msg, setMsg] = createSignal<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [viewAllOpen, setViewAllOpen] = createSignal(false)
  const [viewAllQuery, setViewAllQuery] = createSignal("")
  const [viewAllCollapsed, setViewAllCollapsed] = createSignal(false)

  const all = () => p.list?.all ?? []
  const connectedIds = () => p.list?.connected ?? []
  const authenticatedIds = () => p.list?.authenticated ?? []
  const disabled = () => p.config?.disabled_providers ?? []

  /** 已连接：connected + authenticated（照抄 opencode connected()）。 */
  const connectedList = () =>
    all().filter((x) => connectedIds().includes(x.id) || authenticatedIds().includes(x.id))

  /** 热门：预置列表排除已连接，按列表顺序排序（照抄 opencode popular()）。 */
  const popularList = () => {
    const ids = new Set(connectedIds())
    const items = all().filter((x) => POPULAR_PROVIDER_IDS.includes(x.id) && !ids.has(x.id))
    items.sort((a, b) => POPULAR_PROVIDER_IDS.indexOf(a.id) - POPULAR_PROVIDER_IDS.indexOf(b.id))
    return items
  }

  /** 全部（查看全部区域内）：热门以外、未连接的其余提供商。 */
  const othersList = () =>
    all().filter(
      (x) => !POPULAR_PROVIDER_IDS.includes(x.id) && !connectedIds().includes(x.id) && !authenticatedIds().includes(x.id),
    )

  /** 查看全部区域内的搜索过滤。 */
  const othersFiltered = () => {
    const q = viewAllQuery().trim().toLowerCase()
    if (!q) return othersList()
    return othersList().filter((x) => x.id.toLowerCase().includes(q) || x.name.toLowerCase().includes(q))
  }

  const isConfigCustom = (providerID: string) => {
    const provider = p.config?.provider?.[providerID]
    if (!provider) return false
    if (provider.npm !== "@ai-sdk/openai-compatible") return false
    if (!provider.models || Object.keys(provider.models as Record<string, unknown>).length === 0) return false
    return true
  }

  async function addCustomProvider() {
    const c = client()
    if (!c) return
    const id = name().trim().toLowerCase().replace(/\s+/g, "-")
    if (!id || !baseUrl().trim()) {
      setMsg({ ok: false, text: "请填写名称与 Base URL" })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const modelList = models()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const provider: Record<string, unknown> = {
        id,
        name: name().trim(),
        options: { baseURL: baseUrl().trim() },
        models: modelList,
      }
      if (apiKey().trim()) {
        provider.environment = { [id.toUpperCase() + "_API_KEY"]: apiKey().trim() }
      }
      await c.patchGlobalConfig({
        provider: { ...(p.config?.provider ?? {}), [id]: provider },
      })
      setMsg({ ok: true, text: `已添加自定义提供商「${name()}」` })
      setName("")
      setBaseUrl("")
      setApiKey("")
      setModels("")
      p.onReload()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function toggleProvider(id: string, currentlyDisabled: boolean) {
    const c = client()
    if (!c) return
    setBusy(true)
    try {
      const cur = disabled()
      const next = currentlyDisabled ? cur.filter((x) => x !== id) : [...cur, id]
      await c.patchGlobalConfig({ disabled_providers: next })
      setMsg({ ok: true, text: currentlyDisabled ? `已启用 ${id}` : `已禁用 ${id}` })
      p.onReload()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  /** 连接/断开（照抄 opencode connect/disconnect 语义，MiMo 无 HTTP 认证写入口 → 置灰提示）。 */
  const connectionUnavailable = () => "MiMo 服务端无 HTTP 认证写入接口，请通过 mimo auth / 服务端配置连接"

  const ProviderRow = (prov: ProviderInfo) => {
    const isDisabled = () => disabled().includes(prov.id)
    const tag = sourceLabel(prov.source, isConfigCustom(prov.id))
    const isConnected = () => connectedIds().includes(prov.id) || authenticatedIds().includes(prov.id)
    return (
      <div class="flex items-center gap-3 border-b border-[var(--set-border-soft)] py-2.5 last:border-b-0">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: providerColor(prov.id) }}
        >
          {(prov.name || prov.id).slice(0, 1).toUpperCase()}
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium text-[var(--set-text)]">{prov.name}</span>
            <Show when={isDisabled()}>
              <span class="shrink-0 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500">已禁用</span>
            </Show>
          </div>
          <div class="mt-0.5 flex items-center gap-1.5">
            <Show when={isConnected()}>
              <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="已连接" />
            </Show>
            <span class="truncate text-xs text-[var(--set-text-muted)]">
              {prov.id} · {tag}
            </span>
          </div>
        </div>
        <button class={BTN_CLASS} disabled={busy()} onClick={() => toggleProvider(prov.id, isDisabled())} title={isDisabled() ? "启用" : "禁用"}>
          {isDisabled() ? "启用" : "禁用"}
        </button>
      </div>
    )
  }

  return (
    <div>
      <Show when={msg()}>
        <p class={`mb-3 text-xs ${msg()!.ok ? "text-emerald-600" : "text-red-500"}`}>{msg()!.text}</p>
      </Show>

      {/* 已连接（照抄 connected section） */}
      <Section
        title="已连接"
        action={
          <span class="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-[var(--set-text-secondary)]">
            {connectedList().length}
          </span>
        }
      >
        <Show
          when={connectedList().length > 0}
          fallback={<p class="py-2.5 text-xs text-[var(--set-text-muted)]">暂无已连接的提供商</p>}
        >
          <For each={connectedList()}>{(prov) => ProviderRow(prov)}</For>
        </Show>
      </Section>

      {/* 热门（照抄 popular section，含底部自定义入口 + 查看全部） */}
      <Section title="热门">
        <For each={popularList()}>{(prov) => ProviderRow(prov)}</For>

        {/* 自定义提供商入口行（照抄） */}
        <div class="flex items-center justify-between gap-3 border-b border-[var(--set-border-soft)] py-2.5 last:border-b-0">
          <div class="min-w-0">
            <p class="text-sm font-medium text-[var(--set-text)]">自定义提供商</p>
            <p class="mt-0.5 text-xs text-[var(--set-text-muted)]">添加任意 OpenAI 兼容 API</p>
          </div>
          <button class={BTN_CLASS} onClick={() => setViewAllCollapsed(false)} title={connectionUnavailable()}>
            + 连接
          </button>
        </div>

        {/* 查看全部提供商（照抄 viewAll，展开后带搜索） */}
        <div class="py-1">
          <button
            class="flex w-full items-center justify-between py-1.5 text-left text-sm font-medium text-[var(--set-accent-text)] hover:text-[var(--accent)]"
            onClick={() => setViewAllOpen(!viewAllOpen())}
          >
            <span>{viewAllOpen() ? "收起全部提供商" : "查看全部提供商"}</span>
            <span class={`text-[var(--set-text-muted)] transition-transform ${viewAllOpen() ? "rotate-90" : ""}`}>›</span>
          </button>
        </div>

        <Show when={viewAllOpen()}>
          <div class="relative mt-1 mb-2">
            <Search size={14} class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400" />
            <input
              class={`${INPUT_CLASS} w-full py-1 pl-8 text-xs`}
              placeholder="搜索提供商…"
              value={viewAllQuery()}
              onInput={(e) => setViewAllQuery(e.currentTarget.value)}
            />
          </div>
          <button
            class="flex w-full items-center justify-between py-2 text-left text-sm text-[var(--set-text-secondary)] hover:text-[var(--set-text)]"
            onClick={() => setViewAllCollapsed(!viewAllCollapsed())}
          >
            <span>其他提供商（{othersFiltered().length}）</span>
            <span class={`transition-transform ${viewAllCollapsed() ? "" : "rotate-90"}`}>›</span>
          </button>
          <Show when={!viewAllCollapsed()}>
            <div>
              <For each={othersFiltered()}>{(prov) => ProviderRow(prov)}</For>
              <Show when={othersFiltered().length === 0}>
                <p class="py-2 text-xs text-[var(--set-text-muted)]">没有匹配的提供商</p>
              </Show>
            </div>
          </Show>
        </Show>
      </Section>

      {/* 自定义提供商表单（照抄 DialogCustomProvider 语义） */}
      <Section
        title="添加自定义提供商"
        action={<Plug size={13} class="text-[var(--set-accent-text)]" />}
      >
        <div class="flex flex-col gap-2 py-2.5">
          <input class={INPUT_CLASS} placeholder="名称，如 my-provider" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
          <input class={INPUT_CLASS} placeholder="Base URL，如 https://api.example.com/v1" value={baseUrl()} onInput={(e) => setBaseUrl(e.currentTarget.value)} />
          <input
            class={INPUT_CLASS}
            placeholder="API Key 环境变量值（可选，写入 provider.environment）"
            type="password"
            value={apiKey()}
            onInput={(e) => setApiKey(e.currentTarget.value)}
          />
          <input class={INPUT_CLASS} placeholder="模型 ID 列表，逗号分隔（可选）" value={models()} onInput={(e) => setModels(e.currentTarget.value)} />
          <div>
            <button class={PRIMARY_BTN_CLASS} disabled={busy()} onClick={addCustomProvider}>
              {busy() ? "保存中…" : "添加提供商"}
            </button>
          </div>
          <p class="text-xs text-[var(--set-text-muted)]">写入 ~/.config/mimocode/mimocode.jsonc（PATCH /global/config）</p>
        </div>
      </Section>
    </div>
  )
}
