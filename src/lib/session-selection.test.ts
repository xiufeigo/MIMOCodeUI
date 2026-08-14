import { describe, expect, it } from "vitest"
import { modelOptionKey, modelKeyFromInfo, resolveSessionSelection, type SessionSelectionInput } from "./session-selection"
import type { AgentInfo, GlobalConfig, SessionMessage } from "./protocol/types"

function message(overrides: Omit<Partial<SessionMessage["info"]>, "role"> & { role: "user" | "assistant" }, created = 100): SessionMessage {
  return {
    info: {
      id: Math.random().toString(36).slice(2),
      sessionID: "s1",
      agentID: "a",
      time: { created },
      ...overrides,
      role: overrides.role,
    },
    parts: [],
  }
}

function agent(name: string, extra: Partial<AgentInfo> = {}): AgentInfo {
  return { name, ...extra }
}

function input(partial: Partial<SessionSelectionInput>): SessionSelectionInput {
  return {
    messages: [],
    agents: [],
    models: [],
    ...partial,
  }
}

describe("modelKeyFromInfo", () => {
  it("prefers the nested model ref", () => {
    expect(modelKeyFromInfo({ model: { providerID: "p", modelID: "m" }, providerID: "old", modelID: "old-m" })).toBe("p/m")
  })

  it("falls back to flat provider/model fields", () => {
    expect(modelKeyFromInfo({ providerID: "p", modelID: "m" })).toBe("p/m")
  })

  it("returns undefined when no model is present", () => {
    expect(modelKeyFromInfo({})).toBeUndefined()
  })
})

describe("resolveSessionSelection", () => {
  const agents: AgentInfo[] = [agent("build"), agent("plan"), agent("sub", { mode: "subagent" })]
  const models = [
    { providerID: "mimo", modelID: "mimo-v2.5", label: "mimo · mimo-v2.5" },
    { providerID: "mimo", modelID: "other", label: "mimo · other" },
  ]

  it("returns server default agent and config model when there are no messages", () => {
    const config: GlobalConfig = { default_agent: "plan", model: "mimo/mimo-v2.5" }
    const result = resolveSessionSelection(input({ agents, models, globalConfig: config }))
    expect(result.agent).toBe("plan")
    expect(result.model).toBe("mimo/mimo-v2.5")
  })

  it("falls back to the first selectable agent when no default is configured", () => {
    const result = resolveSessionSelection(input({ agents, models }))
    expect(result.agent).toBe("build")
  })

  it("uses the latest user message's actual agent and model", () => {
    const messages = [
      message({ role: "user", agent: "plan", model: { providerID: "mimo", modelID: "other" } }, 200),
      message({ role: "assistant", agent: "build", providerID: "mimo", modelID: "mimo-v2.5" }, 100),
    ]
    const result = resolveSessionSelection(input({ agents, models, messages }))
    expect(result.agent).toBe("plan")
    expect(result.model).toBe("mimo/other")
  })

  it("falls back to the latest assistant message when the user message has no model", () => {
    const messages = [
      message({ role: "user", agent: "build" }, 200),
      message({ role: "assistant", agent: "build", providerID: "mimo", modelID: "mimo-v2.5" }, 100),
    ]
    const result = resolveSessionSelection(input({ agents, models, messages }))
    expect(result.agent).toBe("build")
    expect(result.model).toBe("mimo/mimo-v2.5")
  })

  it("uses the newest message even when the array order is reversed", () => {
    const messages = [
      message({ role: "assistant", agent: "build", providerID: "mimo", modelID: "mimo-v2.5" }, 100),
      message({ role: "assistant", agent: "plan", providerID: "mimo", modelID: "other" }, 300),
    ]
    const result = resolveSessionSelection(input({ agents, models, messages }))
    expect(result.agent).toBe("plan")
    expect(result.model).toBe("mimo/other")
  })

  it("does not leak a value when the historical agent/model is no longer available", () => {
    const messages = [message({ role: "user", agent: "removed", model: { providerID: "gone", modelID: "gone" } }, 200)]
    const result = resolveSessionSelection(input({ agents, models, messages, globalConfig: { default_agent: "plan", model: "mimo/mimo-v2.5" } }))
    expect(result.agent).toBe("plan")
    expect(result.model).toBe("mimo/mimo-v2.5")
  })

  it("prefers the agent's configured model over the global config", () => {
    const withAgentModel: AgentInfo[] = [agent("build", { model: { providerID: "mimo", modelID: "other" } })]
    const result = resolveSessionSelection(
      input({ agents: withAgentModel, models, globalConfig: { default_agent: "build", model: "mimo/mimo-v2.5" } }),
    )
    expect(result.agent).toBe("build")
    expect(result.model).toBe("mimo/other")
  })

  it("falls back to the first visible model when nothing else is available", () => {
    const result = resolveSessionSelection(input({ agents, models }))
    expect(result.model).toBe(modelOptionKey(models[0]))
  })
})
