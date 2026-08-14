// Global event-driven store.
// Mirrors the opencode TUI pattern (sync.tsx): a single Solid store keyed by
// session/message/part, mutated from the SSE event stream via produce.

import { batch, createSignal } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import type {
  EventEnvelope,
  MessagePart,
  PermissionRequest,
  ProviderInfo,
  QuestionRequest,
  SessionInfo,
  SessionMessage,
} from "../protocol/types"
import { modelKeyFromInfo } from "../session-selection"

/** 模型上下文上限未知时的展示兜底值（0 表示未知，界面上显示 0）。 */
export const DEFAULT_CONTEXT_LIMIT = 0

export type ConnectionState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; serverVersion?: string }
  | { status: "error"; message: string }

export interface SessionStatus {
  type: "busy" | "idle" | "retry" | "error"
  message?: string
}

interface StoreShape {
  sessions: Record<string, SessionInfo>
  sessionOrder: string[]
  messages: Record<string, SessionMessage[]> // sessionID -> messages (newest first)
  parts: Record<string, Record<string, MessagePart>> // messageID -> partID -> part
  permissions: Record<string, PermissionRequest[]> // sessionID -> pending
  questions: Record<string, QuestionRequest[]> // sessionID -> pending
  status: Record<string, SessionStatus>
  agents: { name: string }[]
  providers: ProviderInfo[]
}

export function createAppStore() {
  const [conn, setConn] = createSignal<ConnectionState>({ status: "disconnected" })
  const [store, setStore] = createStore<StoreShape>({
    sessions: {},
    sessionOrder: [],
    messages: {},
    parts: {},
    permissions: {},
    questions: {},
    status: {},
    agents: [],
    providers: [],
  })

  /** Handle a decoded SSE envelope, mutating the store. */
  function handleEvent(env: EventEnvelope) {
    const { type, properties } = env.payload
    const sid: string | undefined = properties.sessionID

    switch (type) {
      case "server.connected":
        setConn({ status: "connected" })
        break

      case "server.heartbeat":
        break

      case "session.created":
      case "session.updated": {
        const s = properties.session as SessionInfo
        if (!s?.id) break
        setStore(
          "sessions",
          produce((sessions) => {
            sessions[s.id] = { ...sessions[s.id], ...s }
          }),
        )
        setStore(
          "sessionOrder",
          produce((order) => {
            if (!order.includes(s.id)) order.unshift(s.id)
            else {
              order.splice(order.indexOf(s.id), 1)
              order.unshift(s.id)
            }
          }),
        )
        break
      }

      case "session.deleted": {
        const id = properties.sessionID as string
        if (!id) break
        setStore(
          "sessions",
          produce((sessions) => {
            delete sessions[id]
          }),
        )
        setStore(
          "sessionOrder",
          produce((order) => {
            const i = order.indexOf(id)
            if (i >= 0) order.splice(i, 1)
          }),
        )
        break
      }

      case "session.status": {
        const status = properties.status as { type?: string; message?: string }
        if (!sid || !status?.type) break
        setStore("status", sid, {
          type: status.type,
          message: status.message,
        } as SessionStatus)
        break
      }

      case "message.updated": {
        const msg = properties.message as SessionMessage
        if (!msg?.info?.id || !sid) break
        setStore(
          "messages",
          produce((all) => {
            const list = all[sid] ?? []
            const idx = list.findIndex((m) => m.info.id === msg.info.id)
            if (idx >= 0) list[idx] = reconcile(msg, { merge: true })(list[idx]) ?? msg
            else list.unshift(msg)
            all[sid] = list
          }),
        )
        setStore(
          "parts",
          produce((partsByMsg) => {
            const msgParts = partsByMsg[msg.info.id] ?? {}
            for (const p of msg.parts) msgParts[p.id] = reconcile(p, { merge: true })(msgParts[p.id]) ?? p
            partsByMsg[msg.info.id] = msgParts
          }),
        )
        break
      }

      case "message.updated.1": {
        // Versioned alias of message.updated used by MiMo's sync protocol.
        const msg = properties.message as SessionMessage
        if (!msg?.info?.id || !sid) break
        setStore(
          "messages",
          produce((all) => {
            const list = all[sid] ?? []
            const idx = list.findIndex((m) => m.info.id === msg.info.id)
            if (idx >= 0) list[idx] = reconcile(msg, { merge: true })(list[idx]) ?? msg
            else list.unshift(msg)
            all[sid] = list
          }),
        )
        setStore(
          "parts",
          produce((partsByMsg) => {
            const msgParts = partsByMsg[msg.info.id] ?? {}
            for (const p of msg.parts) msgParts[p.id] = reconcile(p, { merge: true })(msgParts[p.id]) ?? p
            partsByMsg[msg.info.id] = msgParts
          }),
        )
        break
      }

      case "message.part.updated": {
        const part = properties.part as MessagePart
        const mid = properties.messageID as string
        if (!part?.id || !mid || !sid) break
        setStore(
          "parts",
          produce((partsByMsg) => {
            const msgParts = partsByMsg[mid] ?? {}
            msgParts[part.id] = reconcile(part, { merge: true })(msgParts[part.id]) ?? part
            partsByMsg[mid] = msgParts
          }),
        )
        patchMessagePart(sid, mid, part)
        break
      }

      case "message.part.removed": {
        const partID = properties.partID as string
        const mid = properties.messageID as string
        if (!partID || !mid || !sid) break
        setStore(
          "parts",
          produce((partsByMsg) => {
            delete partsByMsg[mid]?.[partID]
          }),
        )
        removeMessagePart(sid, mid, partID)
        break
      }

      case "message.part.delta": {
        // Streamed text delta. properties: { sessionID, messageID, partID, delta }
        const partID = properties.partID as string
        const mid = properties.messageID as string
        const delta = properties.delta as string | undefined
        if (!partID || !mid || !delta || !sid) break
        setStore(
          "parts",
          produce((partsByMsg) => {
            const part = partsByMsg[mid]?.[partID]
            if (part && "text" in part && typeof part.text === "string") {
              ;(part as { text: string }).text += delta
            }
          }),
        )
        appendMessagePartDelta(sid, mid, partID, delta)
        break
      }

      case "permission.asked": {
        // MiMo emits FLAT properties: { id, sessionID, permission, patterns,
        // metadata, always, tool } — not a nested `request` object.
        const props = properties as Record<string, unknown>
        const reqId = (props.id ?? props.requestID) as string | undefined
        if (!reqId) break
        const sessionID = (props.sessionID ?? sid) as string
        if (!sessionID) break
        const req: PermissionRequest = {
          id: reqId,
          sessionID,
          permission: (props.permission as string) ?? undefined,
          action: (props.permission as string) ?? "unknown",
          patterns: (props.patterns as string[]) ?? (props.resources as string[]) ?? [],
          message: (props.message as string) ?? undefined,
          metadata: (props.metadata as Record<string, unknown>) ?? undefined,
        }
        setStore(
          "permissions",
          produce((all) => {
            const list = all[sessionID] ?? []
            if (!list.some((r) => r.id === req.id)) list.push(req)
            all[sessionID] = list
          }),
        )
        break
      }

      case "permission.replied": {
        const requestID = (properties.requestID ?? properties.id) as string
        const sessionID = (properties.sessionID ?? sid) as string
        if (!requestID || !sessionID) break
        setStore(
          "permissions",
          produce((all) => {
            all[sessionID] = (all[sessionID] ?? []).filter((r) => r.id !== requestID)
          }),
        )
        break
      }

      case "question.asked": {
        // MiMo flat properties: { id, sessionID, questions: [{question, ...}], tool }
        const props = properties as Record<string, unknown>
        const reqId = (props.id ?? props.requestID) as string | undefined
        if (!reqId) break
        const sessionID = (props.sessionID ?? sid) as string
        if (!sessionID) break
        const qs = (props.questions as QuestionRequest["questions"]) ?? [{ question: String(props.question ?? "确认？") }]
        const req: QuestionRequest = {
          id: reqId,
          sessionID,
          questions: qs,
          tool: (props.tool as string) ?? undefined,
        }
        setStore(
          "questions",
          produce((all) => {
            const list = all[sessionID] ?? []
            if (!list.some((r) => r.id === req.id)) list.push(req)
            all[sessionID] = list
          }),
        )
        break
      }

      case "question.replied":
      case "question.rejected": {
        const requestID = properties.requestID as string
        const sessionID = properties.sessionID ?? sid
        if (!requestID || !sessionID) break
        setStore(
          "questions",
          produce((all) => {
            all[sessionID] = (all[sessionID] ?? []).filter((r) => r.id !== requestID)
          }),
        )
        break
      }

      default:
        break
    }
  }

  function patchMessagePart(sessionID: string, messageID: string, part: MessagePart) {
    setStore(
      "messages",
      sessionID,
      produce((messages) => {
        const message = messages.find((item) => item.info.id === messageID)
        if (!message) return
        const index = message.parts.findIndex((item) => item.id === part.id)
        if (index >= 0) message.parts[index] = reconcile(part, { merge: true })(message.parts[index]) ?? part
        else message.parts.push(part)
      }),
    )
  }

  function appendMessagePartDelta(sessionID: string, messageID: string, partID: string, delta: string) {
    setStore(
      "messages",
      sessionID,
      produce((messages) => {
        const message = messages.find((item) => item.info.id === messageID)
        const part = message?.parts.find((item) => item.id === partID)
        if (part && "text" in part && typeof part.text === "string") (part as { text: string }).text += delta
      }),
    )
  }

  function removeMessagePart(sessionID: string, messageID: string, partID: string) {
    setStore(
      "messages",
      sessionID,
      produce((messages) => {
        const message = messages.find((item) => item.info.id === messageID)
        if (!message) return
        const index = message.parts.findIndex((item) => item.id === partID)
        if (index >= 0) message.parts.splice(index, 1)
      }),
    )
  }

  function ingest(envs: EventEnvelope[]) {
    batch(() => {
      for (const env of envs) handleEvent(env)
    })
  }

  /** Merge a freshly-fetched message list into the store (hydration). */
  function hydrateMessages(sessionID: string, messages: SessionMessage[]) {
    setStore(
      "messages",
      produce((all) => {
        all[sessionID] = messages
      }),
    )
    setStore(
      "parts",
      produce((partsByMsg) => {
        for (const m of messages) {
          const msgParts = partsByMsg[m.info.id] ?? {}
          for (const p of m.parts) msgParts[p.id] = p
          partsByMsg[m.info.id] = msgParts
        }
      }),
    )
  }

  /**
   * Backfill pending permission requests after (re)connect. SSE can drop
   * permission.asked events while the stream is down, so we reconcile against
   * the server's /permission list.
   */
  function backfillPermissions(requests: PermissionRequest[]) {
    setStore(
      "permissions",
      produce((all) => {
        for (const req of requests) {
          if (!req?.id) continue
          const sessionID = req.sessionID
          if (!sessionID) continue
          const list = all[sessionID] ?? []
          if (!list.some((r) => r.id === req.id)) list.push(req)
          all[sessionID] = list
        }
      }),
    )
  }

  /** Select ordered message list for a session (newest first as stored). */
  function sessionMessages(sessionID: string): SessionMessage[] {
    return store.messages[sessionID] ?? []
  }

  /** Ordered parts for a message (by insertion). */
  function messageParts(messageID: string): MessagePart[] {
    const map = store.parts[messageID]
    return map ? Object.values(map) : []
  }

  /** 按 `providerID/modelID`（或仅 modelID）在 providers 注册表里查上下文窗口。 */
  function modelContextLimit(modelKey: string): number | undefined {
    if (!modelKey) return undefined
    const modelID = modelKey.slice(modelKey.lastIndexOf("/") + 1)
    let byID: number | undefined
    for (const provider of store.providers) {
      for (const model of Object.values(provider.models ?? {})) {
        const limit = model.limit?.context
        if (!limit) continue
        const key = `${model.providerID ?? provider.id}/${model.id}`
        if (key === modelKey) return limit
        if (model.id === modelID) byID = limit
      }
    }
    return byID
  }

  /** 会话当前模型的上下文上限（取最近一条 assistant 消息所用模型），未知则兜底 0。 */
  function contextLimit(sessionID: string): number {
    const messages = store.messages[sessionID] ?? []
    for (const m of messages) {
      if (m.info?.role !== "assistant") continue
      const limit = modelContextLimit(modelKeyFromInfo(m.info) ?? "")
      if (limit) return limit
    }
    return DEFAULT_CONTEXT_LIMIT
  }

  /** Reset state when the single active server connection changes. */
  function reset() {
    setStore({
      sessions: {},
      sessionOrder: [],
      messages: {},
      parts: {},
      permissions: {},
      questions: {},
      status: {},
      agents: [],
      providers: [],
    })
  }

  return {
    conn,
    setConn,
    store,
    setStore,
    reset,
    handleEvent,
    ingest,
    hydrateMessages,
    backfillPermissions,
    sessionMessages,
    messageParts,
    modelContextLimit,
    contextLimit,
  }
}

export type AppStore = ReturnType<typeof createAppStore>
