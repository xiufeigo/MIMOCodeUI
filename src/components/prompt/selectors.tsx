import { createMemo, createSignal, For, Show, type Component } from "solid-js"
import { Bot, Check, ChevronDown, ChevronRight, Zap } from "lucide-solid"
import { PopoverSurface } from "../overlay/popover-surface"
import type { AgentInfo } from "../../lib/protocol/types"
import { reasoningEffortOptions, type PromptModelOption, type ReasoningEffort, type ReasoningEffortOption } from "./types"

const triggerClass =
  "flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"

const itemClass = (active: boolean) =>
  `flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--bg-hover)] ${
    active ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"
  }`

export function modelKey(model: Pick<PromptModelOption, "providerID" | "modelID">): string {
  return `${model.providerID}/${model.modelID}`
}

// ---- Agent selector (flat list) ----

interface AgentSelectorProps {
  agent?: string
  agents: AgentInfo[]
  open: boolean
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (name: string | undefined) => void
}

export const AgentSelector: Component<AgentSelectorProps> = (p) => {
  let trigger: HTMLElement | null = null
  return (
    <>
      <button
        ref={(el) => (trigger = el)}
        class={triggerClass}
        aria-label="选择 Agent"
        aria-expanded={p.open}
        disabled={p.disabled}
        onClick={() => p.onOpenChange(!p.open)}
      >
        <Bot size={14} class="shrink-0" />
        <span class="max-w-32 truncate">{p.agent ?? "Agent"}</span>
        <ChevronDown size={13} class="shrink-0" />
      </button>
      <PopoverSurface open={p.open} reference={trigger} width={220} onClose={() => p.onOpenChange(false)}>
        <For each={p.agents}>
          {(agent) => (
            <button class={itemClass(agent.name === p.agent)} onClick={() => p.onSelect(agent.name)}>
              <span class="min-w-0 flex-1 truncate">{agent.name}</span>
              <Show when={agent.name === p.agent}>
                <Check size={13} class="shrink-0" />
              </Show>
            </button>
          )}
        </For>
      </PopoverSurface>
    </>
  )
}

// ---- Model selector (provider → hover submenu) ----

interface ModelGroup {
  providerID: string
  providerName: string
  models: PromptModelOption[]
}

interface ModelSelectorProps {
  model?: string
  models: PromptModelOption[]
  open: boolean
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (model: string | undefined) => void
}

function groupByProvider(models: PromptModelOption[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>()
  for (const m of models) {
    let group = map.get(m.providerID)
    if (!group) {
      group = { providerID: m.providerID, providerName: m.providerName, models: [] }
      map.set(m.providerID, group)
    }
    group.models.push(m)
  }
  return Array.from(map.values())
    .sort((a, b) => a.providerName.localeCompare(b.providerName))
    .map((g) => ({ ...g, models: g.models.slice().sort((a, b) => a.label.localeCompare(b.label)) }))
}

export const ModelSelector: Component<ModelSelectorProps> = (p) => {
  let trigger: HTMLElement | null = null
  const groups = createMemo(() => groupByProvider(p.models))
  const [hoveredProvider, setHoveredProvider] = createSignal<string | null>(null)

  const currentModel = () => p.models.find((m) => modelKey(m) === p.model)
  const activeProvider = () => {
    if (hoveredProvider()) return hoveredProvider()
    const current = currentModel()
    if (current) return current.providerID
    return groups()[0]?.providerID ?? null
  }
  const activeModels = () => groups().find((g) => g.providerID === activeProvider())?.models ?? []
  const label = () => {
    const current = currentModel()
    return current ? `${current.providerName} · ${current.label}` : "模型"
  }

  return (
    <>
      <button
        ref={(el) => (trigger = el)}
        class={triggerClass}
        aria-label="选择模型"
        aria-expanded={p.open}
        disabled={p.disabled}
        onClick={() => p.onOpenChange(!p.open)}
      >
        <span class="max-w-40 truncate">{label()}</span>
        <ChevronDown size={13} class="shrink-0" />
      </button>
      <PopoverSurface open={p.open} reference={trigger} width={360} onClose={() => p.onOpenChange(false)}>
        <div class="flex max-h-72">
          <div class="w-40 shrink-0 overflow-y-auto border-r border-[var(--border-color)] py-1">
            <For each={groups()}>
              {(group) => (
                <button
                  class={`flex w-full min-w-0 items-center gap-1 px-3 py-2 text-left text-xs hover:bg-[var(--bg-hover)] ${
                    group.providerID === activeProvider() ? "bg-[var(--bg-raised)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  }`}
                  onMouseEnter={() => setHoveredProvider(group.providerID)}
                  onClick={() => setHoveredProvider(group.providerID)}
                >
                  <span class="min-w-0 flex-1 truncate">{group.providerName}</span>
                  <ChevronRight size={13} class="shrink-0 text-[var(--text-muted)]" />
                </button>
              )}
            </For>
          </div>
          <div class="min-w-0 flex-1 overflow-y-auto py-1">
            <For each={activeModels()}>
              {(model) => (
                <button class={itemClass(modelKey(model) === p.model)} onClick={() => p.onSelect(modelKey(model))}>
                  <span class="min-w-0 flex-1 truncate">{model.label}</span>
                  <Show when={modelKey(model) === p.model}>
                    <Check size={13} class="shrink-0" />
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
      </PopoverSurface>
    </>
  )
}

// ---- Reasoning effort selector ----

interface ReasoningEffortSelectorProps {
  value?: ReasoningEffort
  open: boolean
  disabled?: boolean
  /** 动态思考强度选项（由当前模型的 variants 生成；缺省回退五档）。 */
  effortOptions?: ReasoningEffortOption[]
  onOpenChange: (open: boolean) => void
  onSelect: (value: ReasoningEffort) => void
}

export const ReasoningEffortSelector: Component<ReasoningEffortSelectorProps> = (p) => {
  let trigger: HTMLElement | null = null
  const options = () => p.effortOptions ?? reasoningEffortOptions(undefined)
  const current = () =>
    options().find((e) => e.value === (p.value ?? "default")) ?? options()[0] ?? { value: "default", label: "默认" }
  return (
    <>
      <button
        ref={(el) => (trigger = el)}
        class={triggerClass}
        aria-label="选择思考强度"
        aria-expanded={p.open}
        disabled={p.disabled}
        onClick={() => p.onOpenChange(!p.open)}
      >
        <Zap size={14} class="shrink-0" />
        <span class="max-w-20 truncate">{current().label}</span>
        <ChevronDown size={13} class="shrink-0" />
      </button>
      <PopoverSurface open={p.open} reference={trigger} width={140} onClose={() => p.onOpenChange(false)}>
        <For each={options()}>
          {(effort) => (
            <button class={itemClass(effort.value === (p.value ?? "default"))} onClick={() => p.onSelect(effort.value)}>
              <span class="min-w-0 flex-1 truncate">{effort.label}</span>
              <Show when={effort.value === (p.value ?? "default")}>
                <Check size={13} class="shrink-0" />
              </Show>
            </button>
          )}
        </For>
      </PopoverSurface>
    </>
  )
}
