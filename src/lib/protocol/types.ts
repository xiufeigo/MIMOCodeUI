// Types for the mimo serve (MiMo-Code) v1 HTTP/SSE protocol.
// Shapes verified empirically against @mimo-ai/cli 0.1.11.

// ---- Session ----

export interface SessionInfo {
  id: string
  slug: string
  title: string
  version: string
  projectID: string
  directory: string
  time: { created: number; updated: number }
  parentID?: string
}

// ---- Messages & parts ----

export interface MessageTime {
  created: number
  completed?: number
}

export interface MessageModelRef {
  providerID: string
  modelID: string
}

export interface MessageInfo {
  id: string
  sessionID: string
  agentID: string
  role: "user" | "assistant"
  agent?: string
  mode?: string
  model?: MessageModelRef
  modelID?: string
  providerID?: string
  parentID?: string
  time: MessageTime
  cost?: number
  tokens?: {
    total: number
    input: number
    output: number
    reasoning?: number
    cache?: { read: number; write: number }
  }
  finish?: string
  error?: string
  summary?: { diffs: unknown[] }
  path?: { cwd: string; root: string }
}

export interface PartBase {
  id: string
  sessionID: string
  messageID: string
  type: string
}

export interface TextPart extends PartBase {
  type: "text"
  text: string
}

export interface ReasoningPart extends PartBase {
  type: "reasoning"
  text: string
  summary?: string
}

export interface ToolPart extends PartBase {
  type: "tool"
  tool: string
  state: {
    status: "pending" | "running" | "completed" | "error"
    input?: unknown
    title?: string
    metadata?: Record<string, unknown>
    output?: unknown
    result?: unknown
    error?: string
  }
  callID?: string
  provider?: string
  time?: MessageTime
}

export interface StepStartPart extends PartBase {
  type: "step-start"
}

export interface StepFinishPart extends PartBase {
  type: "step-finish"
  patch?: { additions: number; deletions: number; files: string[] }
}

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | (PartBase & Record<string, unknown>)

export interface SessionMessage {
  info: MessageInfo
  parts: MessagePart[]
}

// ---- Events ----

export interface EventEnvelope {
  directory?: string
  project?: string
  workspace?: string
  payload: {
    type: string
    properties: Record<string, any>
    // MiMo v1 events carry no id (unlike upstream opencode v2)
  }
}

// ---- Permissions & questions ----
// MiMo emits permission requests with FLAT fields:
// { id, sessionID, permission, patterns, metadata, always, tool }

export interface PermissionRequest {
  id: string
  sessionID: string
  /** Permission type, e.g. "bash", "edit", "external_directory". */
  permission?: string
  /** Legacy alias kept for compatibility. */
  action?: string
  /** Patterns the request covers (e.g. ["C:\\Temp\\*"]). */
  patterns?: string[]
  resources?: string[]
  message?: string
  metadata?: Record<string, unknown>
  save?: boolean
}

export interface QuestionRequest {
  id: string
  sessionID: string
  questions: {
    question: string
    type?: string
    choices?: string[]
    allowCustom?: boolean
  }[]
  tool?: string
}

// ---- Agents & providers ----

export interface AgentInfo {
  name: string
  description?: string
  color?: string
  /** "primary" | "subagent" | "all" — internal subagents are hidden. */
  mode?: string
  /** Hidden agents (internal subagents) must not be user-selectable. */
  hidden?: boolean
  options?: Record<string, unknown>
  /** Agent's default model when the server provides one. */
  model?: MessageModelRef
  permission?: { permission: string; action: string; pattern: string }[]
}

export interface ModelInfo {
  id: string
  providerID?: string
  name?: string
  family?: string
  api?: Record<string, unknown>
  status?: string
  /** 模型上下文/输出窗口（OpenCode 模型定义；MiMo 未直接给出时缺失）。 */
  limit?: { context?: number; output?: number }
  /**
   * 模型支持的思考强度变体（opencode/mimo serve 均返回）：
   * 键如 low/medium/high/max，值为 { reasoningEffort, thinking, effort … }。
   * 为空对象表示不支持任何变体；缺失表示服务端未提供该信息。
   */
  variants?: Record<string, Record<string, unknown>>
}

export interface ProviderInfo {
  id: string
  name: string
  source?: string
  /** NOTE: MiMo returns models as a MAP (record) keyed by model id, not an array. */
  models: Record<string, ModelInfo>
}

/** Response of GET /provider (instance-level provider list). */
export interface ProviderList {
  all: ProviderInfo[]
  default?: string[]
  connected?: string[]
  authenticated?: string[]
}

/** Global config as returned by GET /global/config (partial, open-ended). */
export interface GlobalConfig {
  $schema?: string
  model?: string
  small_model?: string
  default_agent?: string
  logLevel?: string
  disabled_providers?: string[]
  enabled_providers?: string[]
  provider?: Record<string, Record<string, unknown>>
  permission?: Record<string, unknown>
  /** OpenCode 插件：字符串或 [字符串, 选项] 数组。 */
  plugin?: (string | [string, Record<string, unknown>])[]
  /** OpenCode MCP 服务器：名称 → 本地/远程配置 或 { enabled:false }。 */
  mcp?: Record<string, McpConfig>
  /** OpenCode LSP：布尔（整体开关）或 名称 → { command, disabled? }。 */
  lsp?: boolean | Record<string, LspConfig>
  [key: string]: unknown
}

/** MCP 服务器配置（对齐 OpenCode v1 语义，MiMo 可能未实现）。 */
export interface McpConfig {
  type?: "local" | "remote"
  command?: string[]
  url?: string
  enabled?: boolean
  cwd?: string
  environment?: Record<string, string>
  headers?: Record<string, string>
  [key: string]: unknown
}

/** LSP 语言服务器配置（对齐 OpenCode v1 语义，MiMo 可能未实现）。 */
export interface LspConfig {
  command?: string[]
  extensions?: string[]
  disabled?: boolean
  env?: Record<string, string>
  [key: string]: unknown
}

// ---- Health ----

export interface HealthInfo {
  healthy: boolean
  version?: string
}

// ---- Skills ----

export interface SkillInfo {
  name: string
  description?: string
  location?: string
  content?: string
  /** 内置技能（随 mimo 发布）为 true；用户自定义为 false。 */
  bundled?: boolean
}

// ---- Files ----
// /file?path= 用相对路径从 serve 工作区根浏览；条目 path 为相对路径，type 为
// "directory"|"file" 等。绝对路径会被目录 fence 拒绝（返回空/400）。

export interface FileEntry {
  name: string
  path: string
  absolute?: string
  type: string // "directory" | "file" | ...
  isDirectory?: boolean
  size?: number
  mtime?: number
}

export interface FileContent {
  content: string
  truncated?: boolean
  offset?: number
  total?: number
}
