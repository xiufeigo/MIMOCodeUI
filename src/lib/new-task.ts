import type { MimoClient } from "./protocol/client"
import type { SessionInfo } from "./protocol/types"
import type { PromptPart } from "./attachment"

export interface PromptModelReference {
  providerID: string
  modelID: string
}

export interface NewTaskRequest {
  text: string
  directory?: string
  agent?: string
  model?: string
  variant?: string
  parts?: PromptPart[]
}

export function parsePromptModel(model?: string): PromptModelReference | undefined {
  if (!model) return undefined
  const [providerID, modelID] = model.split("/")
  return providerID && modelID ? { providerID, modelID } : undefined
}

/** Creates the task before prompting so a send failure leaves a recoverable session. */
export async function createSessionAndPrompt(
  client: Pick<MimoClient, "createSession" | "promptAsync">,
  request: NewTaskRequest,
  onCreated?: (session: SessionInfo) => void,
): Promise<SessionInfo> {
  const text = request.text.trim()
  if (!text) throw new Error("请输入任务描述")
  const session = await client.createSession(request.directory ? { directory: request.directory } : {})
  onCreated?.(session)
  await client.promptAsync(session.id, {
    parts: request.parts ?? [{ type: "text", text }],
    agent: request.agent,
    model: parsePromptModel(request.model),
    variant: request.variant,
  })
  return session
}
