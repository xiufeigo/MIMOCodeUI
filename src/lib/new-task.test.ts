import { describe, expect, it, vi } from "vitest"
import { createSessionAndPrompt, parsePromptModel } from "./new-task"
import type { SessionInfo } from "./protocol/types"

const session = (id: string): SessionInfo => ({
  id,
  slug: id,
  title: "Task",
  version: "1",
  projectID: "project",
  directory: "C:\\work",
  time: { created: 1, updated: 1 },
})

describe("new task flow", () => {
  it("parses the selected model only when both identifiers exist", () => {
    expect(parsePromptModel("provider/model")).toEqual({ providerID: "provider", modelID: "model" })
    expect(parsePromptModel("provider")).toBeUndefined()
  })

  it("creates a session before submitting its first prompt", async () => {
    const order: string[] = []
    const client = {
      createSession: vi.fn(async () => {
        order.push("create")
        return session("session-1")
      }),
      promptAsync: vi.fn(async () => {
        order.push("prompt")
        return {}
      }),
    }
    const created = vi.fn()

    await createSessionAndPrompt(client, { text: "  build it  ", directory: "C:\\work", agent: "build", model: "p/m" }, created)

    expect(order).toEqual(["create", "prompt"])
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ id: "session-1" }))
    expect(client.createSession).toHaveBeenCalledWith({ directory: "C:\\work" })
    expect(client.promptAsync).toHaveBeenCalledWith("session-1", {
      parts: [{ type: "text", text: "build it" }],
      agent: "build",
      model: { providerID: "p", modelID: "m" },
    })
  })

  it("leaves the created session observable when its first prompt fails", async () => {
    const createdSession = session("session-2")
    const created = vi.fn()
    const client = {
      createSession: vi.fn(async () => createdSession),
      promptAsync: vi.fn(async () => {
        throw new Error("prompt rejected")
      }),
    }

    await expect(createSessionAndPrompt(client, { text: "task" }, created)).rejects.toThrow("prompt rejected")
    expect(created).toHaveBeenCalledWith(createdSession)
  })
})
