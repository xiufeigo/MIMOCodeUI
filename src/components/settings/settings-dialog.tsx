import { createSignal, createEffect, For, Show, type Component } from "solid-js"
import { Boxes, Cpu, Keyboard, Server, SlidersHorizontal, X } from "lucide-solid"
import { useApp, useClient } from "../../lib/store/provider"
import type { GlobalConfig, ProviderInfo, ProviderList } from "../../lib/protocol/types"
import { SettingsGeneral } from "./general"
import { SettingsModels } from "./models"
import { SettingsProviders } from "./providers"
import { SettingsServers } from "./servers"
import { SettingsShortcuts } from "./shortcuts"
import { ModalDialog } from "../overlay/modal-dialog"

export interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

type Tab = "general" | "models" | "providers" | "servers" | "shortcuts"

const TABS: { id: Tab; label: string; icon: typeof Server }[] = [
  { id: "general", label: "通用", icon: SlidersHorizontal },
  { id: "shortcuts", label: "快捷键", icon: Keyboard },
  { id: "servers", label: "服务器", icon: Server },
  { id: "providers", label: "提供商", icon: Boxes },
  { id: "models", label: "模型", icon: Cpu },
]

/**
 * 5-tab settings dialog（OpenCode 桌面版风格）：
 * 白色底 + 左侧浅灰导航 + 主题色选中态；内容区各分块为主题色描边圆角卡片。
 */
export const SettingsDialog: Component<SettingsDialogProps> = (p) => {
  const { connection } = useApp()
  const client = useClient()
  const [tab, setTab] = createSignal<Tab>("general")
  const [providers, setProviders] = createSignal<ProviderInfo[]>([])
  const [providerList, setProviderList] = createSignal<ProviderList | null>(null)
  const [globalConfig, setGlobalConfig] = createSignal<GlobalConfig | null>(null)
  const [dataKey, setDataKey] = createSignal(0)

  async function loadServerData() {
    const c = client()
    if (!c || connection().status !== "connected") return
    try {
      const [prov, plist, cfg] = await Promise.all([
        c.providers(),
        c.providerList().catch(() => null),
        c.getGlobalConfig().catch(() => null),
      ])
      setProviders(prov.providers ?? [])
      setProviderList(plist)
      setGlobalConfig(cfg)
    } catch (e) {
      console.error("settings load failed", e)
    }
  }

  // Reload whenever the dialog is open AND connected (re-runs after connect,
  // tab switches and config writes).
  createEffect(() => {
    if (p.open && connection().status === "connected") {
      void loadServerData()
    }
  })
  createEffect(() => {
    void dataKey()
    if (p.open) void loadServerData()
  })

  function handleChanged() {
    setDataKey((k) => k + 1)
  }

  const defaultModels = () => (globalConfig()?.model ? [String(globalConfig()!.model)] : undefined)

  return (
    <ModalDialog open={p.open} title="设置" onClose={p.onClose} class="w-full max-w-[800px]">
      <div class="settings-light flex h-[min(600px,calc(100dvh-2rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-[var(--set-text)] shadow-2xl sm:flex-row">
        <nav class="flex w-full shrink-0 flex-row gap-1 overflow-x-auto border-b border-neutral-200 bg-[var(--set-nav-bg)] p-2 sm:w-44 sm:flex-col sm:border-b-0 sm:border-r">
          <For each={TABS}>
            {(t) => (
              <button
                class={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  tab() === t.id
                    ? "bg-[var(--set-accent-soft)] font-medium text-[var(--set-accent-text)]"
                    : "text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-800"
                }`}
                onClick={() => setTab(t.id)}
              >
                <t.icon size={15} class={tab() === t.id ? "text-[var(--accent)]" : "text-neutral-400"} />
                {t.label}
              </button>
            )}
          </For>
          <div class="ml-auto border-l border-neutral-200 pl-2 sm:ml-0 sm:mt-auto sm:border-l-0 sm:border-t sm:pl-0 sm:pt-2">
            <button
              class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-800"
              onClick={p.onClose}
            >
              <X size={15} class="text-neutral-400" />
              关闭
            </button>
          </div>
        </nav>

        <div class="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
          <Show when={tab() === "general"}>
            <SettingsGeneral />
          </Show>
          <Show when={tab() === "models"}>
            <SettingsModels providers={providers()} defaultModels={defaultModels()} />
          </Show>
          <Show when={tab() === "providers"}>
            <SettingsProviders list={providerList()} config={globalConfig()} onReload={handleChanged} />
          </Show>
          <Show when={tab() === "servers"}>
            <SettingsServers onChanged={handleChanged} />
          </Show>
          <Show when={tab() === "shortcuts"}>
            <SettingsShortcuts onCommand={() => {}} />
          </Show>
        </div>
      </div>
    </ModalDialog>
  )
}
