// Session-level Agent/model resolution.
//
// The composer must not invent "默认 Agent / 默认模型" labels: it should show
// the Agent/model this session actually used last time (falling back to the
// server's configured default), so values like `build` and `mimo-v2.5` are
// displayed instead of generic placeholders.

import type { AgentInfo, GlobalConfig, MessageModelRef, SessionMessage } from "./protocol/types"

export interface ModelOption {
  providerID: string
  modelID: string
  label: string
}

export interface SessionSelectionInput {
  /** Messages of the session being resolved (newest first or arbitrary order). */
  messages: SessionMessage[]
  /** Selectable (primary, non-hidden) agents offered by the server. */
  agents: AgentInfo[]
  /** Visible model options offered by the composer. */
  models: ModelOption[]
  globalConfig?: GlobalConfig | null
}

export interface SessionSelection {
  agent?: string
  model?: string
}

export function modelOptionKey(option: { providerID: string; modelID: string }): string {
  return `${option.providerID}/${option.modelID}`
}

/** Build a model option key from a message info, preferring the nested ref. */
export function modelKeyFromInfo(info: {
  model?: MessageModelRef
  providerID?: string
  modelID?: string
}): string | undefined {
  if (info.model?.providerID && info.model.modelID) return `${info.model.providerID}/${info.model.modelID}`
  if (info.providerID && info.modelID) return `${info.providerID}/${info.modelID}`
  return undefined
}

function byNewest(a: SessionMessage, b: SessionMessage): number {
  return (b.info.time.created ?? 0) - (a.info.time.created ?? 0)
}

/**
 * Resolve the Agent/model the composer should present for a session.
 *
 * Agent: latest user message -> latest assistant message -> `default_agent` ->
 * first selectable agent. Model: latest user message -> latest assistant
 * message -> the resolved Agent's configured model -> `globalConfig.model` ->
 * first visible model option. Values that no longer exist in the option lists
 * fall back instead of being shown as stale selections.
 */
export function resolveSessionSelection(input: SessionSelectionInput): SessionSelection {
  const latestUser = input.messages.filter((m) => m.info.role === "user").sort(byNewest)[0]
  const latestAssistant = input.messages.filter((m) => m.info.role !== "user").sort(byNewest)[0]

  // Agent
  let agent = latestUser?.info.agent ?? latestAssistant?.info.agent
  if (!agent || !input.agents.some((a) => a.name === agent)) {
    const fallback = input.globalConfig?.default_agent
    agent = fallback && input.agents.some((a) => a.name === fallback) ? fallback : undefined
  }
  agent = agent ?? input.agents[0]?.name

  // Model
  const userKey = latestUser ? modelKeyFromInfo(latestUser.info) : undefined
  const assistantKey = latestAssistant ? modelKeyFromInfo(latestAssistant.info) : undefined
  let model = userKey ?? assistantKey
  const isModelKnown = (key: string | undefined) => key !== undefined && input.models.some((m) => modelOptionKey(m) === key)

  if (!isModelKnown(model)) {
    const agentDef = agent ? input.agents.find((a) => a.name === agent) : undefined
    const agentKey = agentDef?.model ? modelKeyFromInfo({ model: agentDef.model }) : undefined
    model = isModelKnown(agentKey) ? agentKey : undefined
  }
  if (!isModelKnown(model)) {
    model = isModelKnown(input.globalConfig?.model) ? input.globalConfig?.model : undefined
  }
  if (!model) {
    const first = input.models[0]
    model = first ? modelOptionKey(first) : undefined
  }

  return { agent, model }
}
