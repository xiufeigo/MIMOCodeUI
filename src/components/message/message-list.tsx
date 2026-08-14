import { createEffect, createMemo, createSignal, For, Show, type Component } from "solid-js"
import type { MessagePart, SessionMessage } from "../../lib/protocol/types"
import { TextPartView, ReasoningPartView, ToolPartView, FileChangeCard } from "./parts"
import { parseLocalCommandContent } from "../../lib/message-content"

export interface MessageListProps {
  sessionID: string
  messages: SessionMessage[]
}

/**
 * Trae 风格聊天流：全宽卡片、用户右对齐深色气泡、agent 头像 + 耗时标注、
 * 文件变更折叠卡片、每条 assistant 消息下方的反应按钮。
 */
export function MessageList(props: MessageListProps) {
  const ordered = createMemo(() => [...props.messages].reverse())
  let container: HTMLDivElement | undefined

  createEffect(() => {
    void ordered()
    const el = container
    if (el) el.scrollTop = el.scrollHeight
  })

  return (
    <div ref={container} class="min-h-0 flex-1 overflow-y-auto">
      <Show when={ordered().length === 0}>
        <p class="py-10 text-center text-sm text-[var(--text-muted)]">向 Agent 发送第一条消息，开始任务</p>
      </Show>
      <div class="mx-auto flex max-w-4xl flex-col gap-5 px-5 py-5">
        <For each={ordered()}>
          {(m) => <MessageView message={m} />}
        </For>
      </div>
    </div>
  )
}

const MessageView: Component<{ message: SessionMessage }> = (p) => {
  const isUser = () => p.message.info.role === "user"
  const parts = () => p.message.parts

  const fileChanges = createMemo(() => {
    // 聚合 edit/apply_patch/write 工具 part 为「文件变更」卡片
    const changes: { part: MessagePart; tool: string }[] = []
    for (const part of parts()) {
      if (part.type === "tool" && (part.tool === "edit" || part.tool === "apply_patch" || part.tool === "write")) {
        changes.push({ part, tool: part.tool })
      }
    }
    return changes
  })

  const reactionButtons = () => ["👍", "👎", "📋", "📤", "🔁"]

  return (
    <div class={`flex flex-col gap-1.5 ${isUser() ? "items-end" : "items-start"}`}>
      {/* 用户消息：右对齐深色气泡 */}
      <Show when={isUser()}>
        <div class="flex w-full max-w-[75%] min-w-0 flex-col items-end gap-1">
          <div class="max-w-full min-w-0 break-words rounded-2xl rounded-br-md bg-[var(--user-bubble)] px-4 py-2.5 text-sm text-white">
            <For each={parts()}>
              {(part) => {
                if (part.type !== "text") return null
                const content = () => String(part.text ?? "")
                return <UserTextPart text={content()} />
              }}
            </For>
          </div>
          <span class="pr-1 text-[10px] text-[var(--text-muted)]">{formatTime(p.message.info.time.created)}</span>
        </div>
      </Show>

      {/* Agent 消息：左对齐宽卡片 */}
      <Show when={!isUser()}>
        <div class="flex w-full min-w-0 flex-col gap-1.5">
          {/* 头部：头像 + Agent 名 + 模型 + 耗时 */}
          <div class="flex min-w-0 items-center gap-2">
            <div
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: "var(--accent)" }}
            >
              {(p.message.info.agent ?? "A").slice(0, 1).toUpperCase()}
            </div>
            <span class="text-sm font-medium text-[var(--text-primary)]">
              {p.message.info.agent ?? "Agent"}
            </span>
            <Show when={p.message.info.modelID}>
              <span class="text-xs text-[var(--text-muted)]">{p.message.info.modelID}</span>
            </Show>
            <Show when={p.message.info.time.completed}>
              <span class="text-xs text-[var(--text-muted)]">
                · {formatDuration(p.message.info.time.created, p.message.info.time.completed!)}
              </span>
            </Show>
          </div>

          {/* 内容卡片（文件变更折叠卡在内部渲染，不超出气泡） */}
          <div class="w-full min-w-0 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-3">
            <For each={parts()}>
              {(part) => <PartRenderer part={part} hideEditTool={fileChanges().some((change) => change.part.id === part.id)} />}
            </For>
            <Show when={fileChanges().length > 0}>
              <div class="mt-2">
                <FileChangeCard changes={fileChanges()} />
              </div>
            </Show>
          </div>

          {/* 反应按钮 */}
          <div class="flex items-center gap-0.5 pl-8">
            <For each={reactionButtons()}>
              {(btn) => (
                <button
                  class="rounded px-1.5 py-0.5 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                  onClick={() => {}}
                  title={reactionTitle(btn)}
                >
                  {btn}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  )
}

const UserTextPart: Component<{ text: string }> = (p) => {
  const command = () => parseLocalCommandContent(p.text)
  return (
    <Show when={command()} fallback={<span class="whitespace-pre-wrap">{p.text}</span>}>
      {(content) => <LocalCommandBlock content={content()} />}
    </Show>
  )
}

const LocalCommandBlock: Component<{ content: NonNullable<ReturnType<typeof parseLocalCommandContent>> }> = (p) => {
  const [open, setOpen] = createSignal(false)
  const title = () => p.content.commandName ?? p.content.commandMessage ?? "本地命令"
  const subtitle = () => {
    if (p.content.commandName && p.content.commandMessage) return p.content.commandMessage
    if (p.content.commandName) return p.content.commandArgs ?? ""
    return p.content.commandArgs ?? ""
  }
  return (
    <div class="flex min-w-0 flex-col overflow-hidden rounded-lg border border-white/25 bg-black/15 font-mono text-xs text-white/90">
      <button class="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left" onClick={() => setOpen(!open())}>
        <span class={`shrink-0 transition-transform ${open() ? "rotate-90" : ""}`}>›</span>
        <span class="shrink-0 font-semibold">{title()}</span>
        <Show when={subtitle()}>
          <span class="min-w-0 flex-1 truncate text-white/65">{subtitle()}</span>
        </Show>
      </button>
      <Show when={open()}>
        <div class="border-t border-white/15">
          <Show when={p.content.stdout}>
            <pre class="max-h-48 min-w-0 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-white/80">{p.content.stdout}</pre>
          </Show>
          <Show when={p.content.caveat}>
            <p class="border-t border-white/15 px-3 py-1.5 text-[10px] text-white/60">{p.content.caveat}</p>
          </Show>
        </div>
      </Show>
    </div>
  )
}

const PartRenderer: Component<{ part: MessagePart; hideEditTool?: boolean }> = (p) => {
  const type = () => p.part.type
  if (p.hideEditTool) return null
  return (
    <Show
      when={type() === "text"}
      fallback={
        <Show
          when={type() === "reasoning"}
          fallback={
            <Show
              when={type() === "tool"}
              fallback={
                <Show when={type() === "step-start" || type() === "step-finish"}>
                  <div class="my-1 text-xs text-[var(--text-muted)]">{type() === "step-start" ? "开始执行" : "步骤完成"}</div>
                </Show>
              }
            >
              <ToolPartView part={p.part as never} />
            </Show>
          }
        >
          <ReasoningPartView part={p.part as never} />
        </Show>
      }
    >
      <TextPartView part={p.part as never} />
    </Show>
  )
}

function reactionTitle(btn: string): string {
  switch (btn) {
    case "👍":
      return "有帮助"
    case "👎":
      return "无帮助"
    case "📋":
      return "复制"
    case "📤":
      return "分享"
    case "🔁":
      return "重新生成"
    default:
      return ""
  }
}

function formatDuration(from: number, to: number): string {
  const sec = Math.round((to - from) / 1000)
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m${sec % 60}s`
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}
