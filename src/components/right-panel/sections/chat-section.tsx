import { createEffect, createMemo, createSignal, Show, type Component } from "solid-js"
import { MessagesSquare } from "lucide-solid"
import { useApp, useClient } from "../../../lib/store/provider"
import { useSettings } from "../../../lib/settings/store"
import { resolveSessionSelection } from "../../../lib/session-selection"
import { MessageList } from "../../message/message-list"
import { PromptInput } from "../../prompt/prompt-input"
import {
  reasoningEffortOptions,
  type PromptModelOption,
  type ReasoningEffort,
  type ReasoningEffortOption,
} from "../../prompt/types"
import type { AgentInfo, GlobalConfig, ProviderInfo } from "../../../lib/protocol/types"

export interface ChatSectionProps {
  /** 当前会话 id；未选会话时显示占位。 */
  sessionID: string | null
}

/**
 * 右栏「侧边聊天」段：会话消息流 + 复用 PromptInput 的输入框。
 * Agent / 模型 / 思考强度的接线照抄 src/routes/workspace.tsx 的主输入框用法：
 * 手动选择优先，其次会话历史，再退到服务端默认。
 */
export const ChatSection: Component<ChatSectionProps> = (p) => {
  const { store, connection } = useApp()
  const client = useClient()
  const { isModelVisible } = useSettings()

  // providers 由工作台 hydrate 进 store；agents 的 store 副本只带 name，
  // 缺少 mode/hidden，无法判断可选性，因此这里自行拉取完整列表。
  const [agents, setAgents] = createSignal<AgentInfo[]>([])
  const [globalConfig, setGlobalConfig] = createSignal<GlobalConfig | null>(null)
  const [fallbackProviders, setFallbackProviders] = createSignal<ProviderInfo[]>([])

  createEffect(() => {
    if (connection().status !== "connected") return
    const c = client()
    if (!c) return
    void c
      .agents()
      .then(setAgents)
      .catch((error) => console.error("load agents failed", error))
    void c
      .getGlobalConfig()
      .then(setGlobalConfig)
      .catch(() => setGlobalConfig(null))
    // store 里还没有 providers（例如右栏先于工作台 hydrate 挂载）时补拉一次
    if (store.store.providers.length === 0) {
      void c
        .providers()
        .then((result) => {
          if (store.store.providers.length === 0) setFallbackProviders(result.providers ?? [])
        })
        .catch((error) => console.error("load providers failed", error))
    }
  })

  const providers = createMemo<ProviderInfo[]>(() =>
    store.store.providers.length > 0 ? store.store.providers : fallbackProviders(),
  )

  const selectableAgents = createMemo(() => agents().filter((agent) => agent.hidden !== true && agent.mode !== "subagent"))

  const modelOptions = createMemo<PromptModelOption[]>(() => {
    const output: PromptModelOption[] = []
    for (const provider of providers()) {
      for (const model of Object.values(provider.models ?? {})) {
        const key = `${model.providerID ?? provider.id}/${model.id}`
        if (!isModelVisible(key)) continue
        output.push({
          providerID: model.providerID ?? provider.id,
          modelID: model.id,
          providerName: provider.name ?? provider.id,
          label: model.name ?? model.id,
        })
      }
    }
    return output
  })

  const messages = () => (p.sessionID ? store.sessionMessages(p.sessionID) : [])

  /** 服务端/会话历史解析出的 Agent 与模型。 */
  const resolved = createMemo(() =>
    resolveSessionSelection({
      messages: messages(),
      agents: selectableAgents(),
      models: modelOptions(),
      globalConfig: globalConfig(),
    }),
  )

  // 手动选择按会话隔离，避免切换会话互相污染（与 workspace 一致）。
  const selectionKey = () => p.sessionID ?? ""
  const [pendingAgent, setPendingAgent] = createSignal<Record<string, string>>({})
  const [pendingModel, setPendingModel] = createSignal<Record<string, string>>({})
  const [pendingEffort, setPendingEffort] = createSignal<Record<string, string>>({})

  const activeAgent = () => pendingAgent()[selectionKey()] || resolved().agent
  const activeModel = () => pendingModel()[selectionKey()] || resolved().model

  /** 当前模型信息（providerID/modelID → ModelInfo，用于读取 variants）。 */
  const activeModelInfo = createMemo(() => {
    const key = activeModel()
    if (!key) return undefined
    const slash = key.indexOf("/")
    if (slash <= 0) return undefined
    const providerID = key.slice(0, slash)
    const modelID = key.slice(slash + 1)
    return providers().find((provider) => provider.id === providerID)?.models?.[modelID]
  })

  const activeEffortOptions = createMemo<ReasoningEffortOption[]>(() => reasoningEffortOptions(activeModelInfo()?.variants))

  const activeReasoningEffort = (): ReasoningEffort => {
    const pending = pendingEffort()[selectionKey()]
    if (pending && activeEffortOptions().some((o) => o.value === pending)) return pending
    return "default"
  }

  const onAgentChange = (agent: string | undefined) =>
    setPendingAgent((previous) => ({ ...previous, [selectionKey()]: agent ?? "" }))
  const onModelChange = (model: string | undefined) =>
    setPendingModel((previous) => ({ ...previous, [selectionKey()]: model ?? "" }))
  const onReasoningEffortChange = (effort: string) =>
    setPendingEffort((previous) => ({ ...previous, [selectionKey()]: effort }))

  /** 子智能体会话只读：显示「返回主会话」。 */
  const parentSessionID = () => (p.sessionID ? (store.store.sessions[p.sessionID]?.parentID ?? null) : null)

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-color)] px-3">
        <MessagesSquare size={13} class="shrink-0 text-[var(--text-muted)]" />
        <span class="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">侧边聊天</span>
      </div>

      <Show
        when={p.sessionID}
        fallback={
          <div class="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-raised)] text-[var(--text-muted)]">
              <MessagesSquare size={18} />
            </span>
            <p class="text-xs text-[var(--text-secondary)]">请先选择一个任务</p>
            <p class="max-w-[16rem] text-[10px] leading-relaxed text-[var(--text-muted)]">选中任务后即可在这里直接与 Agent 对话。</p>
          </div>
        }
      >
        <MessageList sessionID={p.sessionID!} messages={messages()} />
        {/*
          TODO: 子智能体会话里「返回主会话」需要父级的打开会话能力（onOpenSession），
          当前 RightPanel 的 props 契约里没有传入，因此先不接线（PromptInput 会安全降级为无跳转）。
        */}
        <PromptInput
          sessionID={p.sessionID!}
          agent={activeAgent()}
          model={activeModel()}
          reasoningEffort={activeReasoningEffort()}
          effortOptions={activeEffortOptions()}
          agents={selectableAgents()}
          models={modelOptions()}
          onAgentChange={onAgentChange}
          onModelChange={onModelChange}
          onReasoningEffortChange={onReasoningEffortChange}
          parentSessionID={parentSessionID()}
        />
      </Show>
    </div>
  )
}
