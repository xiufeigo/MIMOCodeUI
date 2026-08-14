// Lightweight HTTP client for the mimo serve v1 protocol.
// Hand-written (not @opencode-ai/sdk / @mimo-ai/sdk): the published
// @mimo-ai/sdk npm package ships no dist (broken package), and upstream
// opencode's v2 SDK event families do not match MiMo's v1 event set.

import type {
  AgentInfo,
  EventEnvelope,
  FileContent,
  FileEntry,
  GlobalConfig,
  HealthInfo,
  PermissionRequest,
  ProviderInfo,
  ProviderList,
  SessionInfo,
  SessionMessage,
  SkillInfo,
} from "./types"
import type { PromptPart } from "../attachment"

export interface ServerConnection {
  baseUrl: string
  username: string
  password: string
}

export function basicAuthHeader(conn: ServerConnection): string {
  const token = btoa(`${conn.username}:${conn.password}`)
  return `Basic ${token}`
}

export class MimoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message)
    this.name = "MimoApiError"
  }
}

/** Thin fetch wrapper that injects Basic auth and parses errors. */
export class MimoClient {
  constructor(readonly conn: ServerConnection) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: basicAuthHeader(this.conn),
      "Content-Type": "application/json",
      ...extra,
    }
  }

  private url(path: string): string {
    return `${this.conn.baseUrl}${path.startsWith("/") ? path : `/${path}`}`
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetch(this.url(path), {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (e) {
      throw new MimoApiError(`请求失败：${(e as Error).message}`, 0, "")    }
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new MimoApiError(`HTTP ${res.status} ${path}`, res.status, text)    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path)
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body)
  }

  // ---- Health ----

  health(): Promise<HealthInfo> {
    return this.get<HealthInfo>("/global/health")
  }

  // ---- Sessions ----

  listSessions(): Promise<SessionInfo[]> {
    return this.get<SessionInfo[]>("/session")
  }

  getSession(sessionID: string): Promise<SessionInfo> {
    return this.get<SessionInfo>(`/session/${sessionID}`)
  }

  createSession(body: { directory?: string; title?: string } = {}): Promise<SessionInfo> {
    return this.post<SessionInfo>("/session", body)
  }

  deleteSession(sessionID: string): Promise<unknown> {
    return this.request<unknown>("DELETE", `/session/${sessionID}`)
  }

  /** Fetch messages (newest first; server returns full list). */
  messages(sessionID: string): Promise<SessionMessage[]> {
    return this.get<SessionMessage[]>(`/session/${sessionID}/message`)
  }

  /**
   * Submit a prompt. Prefer async (client disconnect does not cancel the
   * run on the server); the sync endpoint cancels the runner when the
   * request connection drops, and streams 10s heartbeat whitespace.
   * The async endpoint answers 204 No Content on accept.
   */
  promptAsync(
    sessionID: string,
    body: {
      parts: PromptPart[]
      agent?: string
      model?: { providerID: string; modelID: string }
      variant?: string
      directory?: string
    },
  ): Promise<{ id?: string } | undefined> {
    return this.post<{ id?: string } | undefined>(`/session/${sessionID}/prompt_async`, body)
  }

  abort(sessionID: string): Promise<unknown> {
    return this.post<unknown>(`/session/${sessionID}/abort`)
  }

  // ---- Agents & providers ----

  agents(): Promise<AgentInfo[]> {
    return this.get<AgentInfo[]>("/agent")
  }

  providers(): Promise<{ providers: ProviderInfo[] }> {
    return this.get<{ providers: ProviderInfo[] }>("/config/providers")
  }

  /** Instance-level provider list with connection/auth state. */
  providerList(): Promise<ProviderList> {
    return this.get<ProviderList>("/provider")
  }

  /** All available skills (bundled + user). */
  listSkills(): Promise<SkillInfo[]> {
    return this.get<SkillInfo[]>("/skill")
  }

  // ---- Global config ----

  /** Merged global config (mimocode.jsonc). */
  getGlobalConfig(): Promise<GlobalConfig> {
    return this.get<GlobalConfig>("/global/config")
  }

  /** Merge-patch the global config (writes ~/.config/mimocode/mimocode.jsonc). */
  patchGlobalConfig(patch: Partial<GlobalConfig>): Promise<GlobalConfig> {
    return this.request<GlobalConfig>("PATCH", "/global/config", patch)
  }

  // ---- Permissions & questions ----

  /**
   * All currently-pending permission requests across sessions. Used to
   * backfill the store after (re)connect, since permission.asked events can
   * be missed while the SSE stream is down.
   */
  listPermissions(): Promise<PermissionRequest[]> {
    return this.get<PermissionRequest[]>("/permission")
  }

  replyPermission(requestID: string, reply: "once" | "always" | "reject", message?: string): Promise<unknown> {
    return this.post<unknown>(`/permission/${requestID}/reply`, { reply, message })
  }

  replyQuestion(requestID: string, answers: string[][]): Promise<unknown> {
    return this.post<unknown>(`/question/${requestID}/reply`, { answers })
  }

  rejectQuestion(requestID: string): Promise<unknown> {
    return this.post<unknown>(`/question/${requestID}/reject`, {})
  }

  // ---- Files ----
  // path is relative to the serve workspace root (absolute paths are fenced).

  listFiles(path = ""): Promise<FileEntry[]> {
    return this.get<FileEntry[]>(`/file?path=${encodeURIComponent(path)}`)
  }

  readFile(path: string): Promise<FileContent> {
    return this.get<FileContent>(`/file/content?path=${encodeURIComponent(path)}`)
  }

  findFiles(directory: string, pattern: string): Promise<{ files: string[] }> {
    return this.get<{ files: string[] }>(
      `/find?directory=${encodeURIComponent(directory)}&pattern=${encodeURIComponent(pattern)}`,
    )
  }

  // ---- Events (SSE) ----

  /**
   * Open the global SSE stream. Returns an async-iterable of envelopes.
   * The stream is terminated only when the signal is aborted.
   */
  async *eventStream(signal: AbortSignal): AsyncGenerator<EventEnvelope> {
    const res = await fetch(this.url("/global/event"), {
      headers: { Authorization: basicAuthHeader(this.conn), Accept: "text/event-stream" },
      signal,
    })
    if (!res.ok || !res.body) {
      throw new MimoApiError(`SSE 事件流连接失败（HTTP ${res.status}）`, res.status, "")
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue
            const data = line.slice(5).trim()
            if (!data) continue
            try {
              yield JSON.parse(data) as EventEnvelope
            } catch {
              // ignore malformed frames
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
