// 信息栏的通用折叠段 + 「任务清单 / 产物 / 参考」三段。
//
// 「任务清单」的数据来自消息里的 todo_write 工具调用（parseTodos，纯函数、单测覆盖）；
// 「产物」「参考」当前没有任何服务端来源，如实显示空态，不造假数据。
// 环境信息段在 environment-section.tsx，因为它要拉 Git 状态。

import { createMemo, For, Show, type Component, type JSX } from "solid-js"
import { BookOpen, Check, ChevronDown, ListTodo, Package } from "lucide-solid"
import type { MessagePart } from "../../lib/protocol/types"
import { useApp } from "../../lib/store/provider"

// ---------------------------------------------------------------------------
// 折叠段
// ---------------------------------------------------------------------------

export interface InfoSectionProps {
  /** 段 id；同时用于 aria-controls 关联。 */
  id: string
  icon: JSX.Element
  title: string
  open: boolean
  onToggle: () => void
  /** 标题右侧的计数等补充信息。 */
  hint?: string
  children: JSX.Element
}

/**
 * 折叠段：标题行是整行的可点区域（min-h-9 = 36px，触控下限 32px 之上），
 * 箭头用 ChevronDown + CSS transition 旋转，不依赖 hover 传达展开状态。
 */
export const InfoSection: Component<InfoSectionProps> = (p) => (
  <section class="border-b border-[var(--border-color)] last:border-b-0">
    <button
      type="button"
      class="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
      aria-expanded={p.open}
      aria-controls={`info-section-${p.id}`}
      onClick={p.onToggle}
    >
      <span class="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)]">{p.icon}</span>
      <span class="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">{p.title}</span>
      <Show when={p.hint}>
        <span class="shrink-0 text-[10px] text-[var(--text-muted)]">{p.hint}</span>
      </Show>
      <ChevronDown
        size={14}
        class={`shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${p.open ? "rotate-180" : ""}`}
      />
    </button>
    <Show when={p.open}>
      <div id={`info-section-${p.id}`} class="px-2 pb-2">
        {p.children}
      </div>
    </Show>
  </section>
)

/** 空态：折叠段展开后没有任何内容时的统一说明。 */
export const EmptyHint: Component<{ icon?: JSX.Element; text: string }> = (p) => (
  <div class="flex min-h-11 items-center gap-2 rounded-lg bg-[var(--bg-panel)] px-2 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
    <Show when={p.icon}>
      <span class="flex h-4 w-4 shrink-0 items-center justify-center">{p.icon}</span>
    </Show>
    <span class="min-w-0 flex-1">{p.text}</span>
  </div>
)

// ---------------------------------------------------------------------------
// 任务清单
// ---------------------------------------------------------------------------

export type TodoStatus = "pending" | "in_progress" | "completed"

export interface TodoItem {
  id: string
  content: string
  status: TodoStatus
  /** 工具给出的优先级（high/medium/low），缺失时为 null。 */
  priority: string | null
}

interface MessageLike {
  parts: MessagePart[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 状态归一：不同工具/版本的状态字符串不完全一致，统一收敛到三态。 */
function normalizeStatus(value: unknown): TodoStatus {
  const raw = typeof value === "string" ? value.toLowerCase().replace(/[-\s]/g, "_") : ""
  if (raw === "completed" || raw === "complete" || raw === "done" || raw === "finished") return "completed"
  if (raw === "in_progress" || raw === "active" || raw === "running" || raw === "doing") return "in_progress"
  return "pending"
}

/** 单条任务的文本字段各版本命名不一，逐个兜底。 */
function contentOf(entry: Record<string, unknown>): string {
  for (const key of ["content", "text", "title", "task", "description"]) {
    const value = entry[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function normalizeTodo(entry: unknown, index: number): TodoItem | null {
  if (typeof entry === "string") {
    const content = entry.trim()
    return content ? { id: `todo-${index}`, content, status: "pending", priority: null } : null
  }
  if (!isRecord(entry)) return null
  const content = contentOf(entry)
  if (!content) return null
  const rawID = entry.id ?? entry.key
  const id = typeof rawID === "string" || typeof rawID === "number" ? String(rawID) : `todo-${index}`
  const priority = typeof entry.priority === "string" && entry.priority.trim() ? entry.priority.trim() : null
  return { id, content, status: normalizeStatus(entry.status), priority }
}

/**
 * 从 output 里找出任务数组；找不到返回 null（表示「这次调用还没有结果」，
 * 调用方应继续往前找更早的 todo_write，而不是当成空清单）。
 */
function todoArrayOf(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return null
  for (const key of ["todos", "items", "tasks", "result", "output"]) {
    const nested = value[key]
    if (Array.isArray(nested)) return nested
  }
  // 单条任务对象（直接就是 { content, status }）。
  if (typeof value.content === "string" || typeof value.text === "string") return [value]
  return null
}

/** 解析一次 todo_write 的 output；返回 null 表示无法解析（output 缺失/形态未知）。 */
function parseTodoOutput(output: unknown): TodoItem[] | null {
  let value = output
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      value = JSON.parse(trimmed)
    } catch {
      // 非 JSON：按纯文本任务清单处理，一行一条，去掉常见的前导符号。
      return trimmed
        .split("\n")
        .map((line) => line.replace(/^\s*[-*·]\s*/, "").replace(/^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean)
        .map((content, index) => ({ id: `text-${index}`, content, status: "pending" as const, priority: null }))
    }
  }
  const list = todoArrayOf(value)
  if (!list) return null
  return list.map(normalizeTodo).filter((item): item is TodoItem => item !== null)
}

/**
 * 从会话消息里解析「当前任务清单」。
 *
 * 只看 `type === "tool" && tool === "todo_write"` 的 part，取**第一个**能解析出
 * 清单的调用的结果：store 的消息是最新在前，后一次 todo_write 会覆盖前一次，
 * 排在最前面的那份就是最新状态。output 缺失（工具还在跑）时继续往前找。
 */
export function parseTodos(messages: readonly MessageLike[]): TodoItem[] {
  for (const message of messages) {
    for (const part of message?.parts ?? []) {
      if (!part || part.type !== "tool") continue
      const toolPart = part as Extract<MessagePart, { type: "tool" }>
      if (toolPart.tool !== "todo_write") continue
      const state = toolPart.state as { output?: unknown } | undefined
      const parsed = parseTodoOutput(state?.output)
      if (parsed) return parsed
    }
  }
  return []
}

export interface TodoSectionProps {
  sessionID: string | null
}

/** 任务清单段：展开后展示当前 todo 列表，没有则显示空态。 */
export const TodoSection: Component<TodoSectionProps> = (p) => {
  const { store } = useApp()
  const todos = createMemo(() => parseTodos(p.sessionID ? store.sessionMessages(p.sessionID) : []))

  return (
    <Show
      when={todos().length > 0}
      fallback={<EmptyHint icon={<ListTodo size={13} />} text="暂无任务" />}
    >
      <ul class="flex flex-col gap-1">
        <For each={todos()}>
          {(todo) => (
            <li class="flex min-h-8 items-start gap-2 rounded-lg px-2 py-1.5">
              <span
                class={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  todo.status === "completed"
                    ? "border-[var(--success)] text-[var(--success)]"
                    : "border-[var(--border-strong)] text-transparent"
                }`}
              >
                <Check size={11} />
              </span>
              <span
                class={`min-w-0 flex-1 text-[11px] leading-relaxed ${
                  todo.status === "completed"
                    ? "text-[var(--text-muted)] line-through"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                {todo.content}
              </span>
              <Show when={todo.priority}>
                <span class="shrink-0 self-center text-[10px] text-[var(--text-muted)]">{todo.priority}</span>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </Show>
  )
}

// ---------------------------------------------------------------------------
// 产物 / 参考
// ---------------------------------------------------------------------------

/** 产物段：当前没有服务端来源，如实显示空态（不编造产物列表）。 */
export const ArtifactSection: Component = () => (
  <EmptyHint icon={<Package size={13} />} text="暂无产物" />
)

/** 参考段：当前没有服务端来源，如实显示空态（不编造引用列表）。 */
export const ReferenceSection: Component = () => (
  <EmptyHint icon={<BookOpen size={13} />} text="暂无参考" />
)
