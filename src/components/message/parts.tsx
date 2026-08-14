import { createEffect, createSignal, For, Show, type Component } from "solid-js"
import DOMPurify from "dompurify"
import { marked } from "marked"
import type { MessagePart, ReasoningPart, TextPart, ToolPart } from "../../lib/protocol/types"
import { DiffView } from "../diff/diff-view"
import { parseLocalCommandContent, type LocalCommandContent } from "../../lib/message-content"

type MessagePartLike = MessagePart

function useMarkdown(text: () => string) {
  const [html, setHtml] = createSignal("")
  createEffect(() => {
    const t = text()
    if (!t) {
      setHtml("")
      return
    }
    try {
      setHtml(
        DOMPurify.sanitize(String(marked.parse(t, { async: false, gfm: true, breaks: true })), {
          ALLOWED_TAGS: [
            "a",
            "blockquote",
            "br",
            "code",
            "del",
            "em",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "hr",
            "li",
            "ol",
            "p",
            "pre",
            "strong",
            "table",
            "tbody",
            "td",
            "th",
            "thead",
            "tr",
            "ul",
          ],
          ALLOWED_ATTR: ["href", "title", "target", "rel", "class"],
          ALLOW_UNKNOWN_PROTOCOLS: false,
        }),
      )
    } catch {
      setHtml(`<pre>${escapeHtml(t)}</pre>`)
    }
  })
  return html
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

export const TextPartView: Component<{ part: TextPart }> = (p) => {
  const command = () => parseLocalCommandContent(p.part.text)
  const html = useMarkdown(() => p.part.text)
  return (
    <Show when={command()} fallback={<div class="markdown-body w-full min-w-0 max-w-full text-sm leading-relaxed" innerHTML={html()} />}>
      {(content) => <AssistantLocalCommandBlock content={content()} />}
    </Show>
  )
}

const AssistantLocalCommandBlock: Component<{ content: LocalCommandContent }> = (p) => (
  <LocalCommandBlock content={p.content} />
)

/**
 * OpenCode 风格本地命令折叠块：命令名 + 摘要作为 trigger，展开后显示 stdout，
 * caveat 作为底部弱化元信息（不再用独立的「本地命令提示」details）。
 */
export const LocalCommandBlock: Component<{ content: LocalCommandContent }> = (p) => {
  const [open, setOpen] = createSignal(false)
  const title = () => p.content.commandName ?? p.content.commandMessage ?? "本地命令"
  const subtitle = () => {
    if (p.content.commandName && p.content.commandMessage) return p.content.commandMessage
    if (p.content.commandName) return p.content.commandArgs ?? ""
    return p.content.commandArgs ?? ""
  }
  return (
    <div class="my-1 w-full min-w-0 max-w-full overflow-hidden rounded-md border border-[var(--border-strong)] border-l-2 border-l-[var(--accent)] bg-[var(--bg-panel)]">
      <button class="flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--bg-hover)]" onClick={() => setOpen(!open())}>
        <span class={`shrink-0 transition-transform ${open() ? "rotate-90" : ""}`}>›</span>
        <span class="shrink-0 font-mono font-medium text-[var(--text-primary)]">{title()}</span>
        <Show when={subtitle()}>
          <span class="min-w-0 flex-1 truncate font-mono text-[var(--text-muted)]">{subtitle()}</span>
        </Show>
      </button>
      <Show when={open()}>
        <div class="border-t border-[var(--border-color)]">
          <Show when={p.content.stdout}>
            <pre class="max-h-64 min-w-0 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
              {p.content.stdout}
            </pre>
          </Show>
          <Show when={p.content.caveat}>
            <p class="border-t border-[var(--border-color)] px-3 py-1.5 text-[10px] text-[var(--text-muted)]">{p.content.caveat}</p>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export const ReasoningPartView: Component<{ part: ReasoningPart }> = (p) => {
  const [open, setOpen] = createSignal(false)
  return (
    <div class="mb-1 w-full min-w-0 max-w-full rounded-md border border-[var(--border-strong)] border-l-2 border-l-[var(--text-muted)] bg-[var(--bg-panel)] text-xs text-[var(--text-muted)]">
      <button class="flex w-full min-w-0 items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]" onClick={() => setOpen(!open())}>
        <span class={`shrink-0 transition-transform ${open() ? "rotate-90" : ""}`}>▶</span>
        <span class="min-w-0 flex-1 truncate">{p.part.summary ?? "思考过程"}</span>
      </button>
      <Show when={open()}>
        <pre class="max-h-64 min-w-0 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs text-[var(--text-muted)]">
          {p.part.text}
        </pre>
      </Show>
    </div>
  )
}

/** Trae 风格「文件变更」折叠卡片：聚合编辑类工具 part。 */
export const FileChangeCard: Component<{
  changes: { part: MessagePartLike; tool: string }[]
}> = (p) => {
  const [open, setOpen] = createSignal(false)

  const stats = () => {
    let adds = 0
    let dels = 0
    for (const c of p.changes) {
      const st = (c.part as ToolPart).state
      const out = st?.output
      if (typeof out === "string") {
        for (const line of out.split("\n")) {
          if (line.startsWith("+") && !line.startsWith("+++")) adds++
          else if (line.startsWith("-") && !line.startsWith("---")) dels++
        }
      }
    }
    return { adds, dels }
  }

  return (
    <div class="w-full min-w-0 max-w-full rounded-xl border border-[var(--border-strong)] border-l-2 border-l-[var(--accent)] bg-[var(--bg-panel)]">
      <button
        class="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--bg-hover)]"
        onClick={() => setOpen(!open())}
      >
        <span class={`shrink-0 transition-transform ${open() ? "rotate-90" : ""}`}>›</span>
        <span class="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
          {p.changes.length} 个文件已更改
        </span>
        <span class="flex shrink-0 items-center gap-1.5 font-mono">
          <span class="text-[var(--diff-add)]">+{stats().adds}</span>
          <span class="text-[var(--diff-delete)]">-{stats().dels}</span>
        </span>
      </button>
      <Show when={open()}>
        <div class="border-t border-[var(--border-color)] p-2">
          <For each={p.changes}>
            {(c) => <ToolPartView part={c.part as ToolPart} />}
          </For>
        </div>
      </Show>
    </div>
  )
}

const TOOL_LABEL: Record<string, string> = {
  bash: "Shell",
  shell: "Shell",
  read: "Read",
  edit: "Edit",
  write: "Write",
  glob: "Glob",
  grep: "Grep",
  webfetch: "WebFetch",
  websearch: "WebSearch",
  task: "Task",
  apply_patch: "ApplyPatch",
  todo_write: "Todo",
  plan_enter: "计划模式",
  plan_exit: "计划完成",
}

/** Diff-producing tools render their output as a unified-diff view. */
const DIFF_TOOLS = new Set(["edit", "apply_patch", "write"])

export const ToolPartView: Component<{ part: ToolPart }> = (p) => {
  const [open, setOpen] = createSignal(false)
  const label = () => TOOL_LABEL[p.part.tool] ?? p.part.tool
  const status = () => p.part.state?.status ?? "pending"

  const statusColor = () =>
    status() === "error"
      ? "text-[var(--error)]"
      : status() === "completed"
        ? "text-[var(--success)]"
        : "text-[var(--accent)]"

  const summary = () => {
    const st = p.part.state
    if (st?.title) return st.title
    const meta = st?.metadata as Record<string, unknown> | undefined
    if (p.part.tool === "bash") return (meta?.command as string) ?? ""
    return ""
  }

  /** Extract unified diff text from the tool state (content field or raw string). */
  const diffText = () => {
    const st = p.part.state
    const out = st?.output
    const candidates: unknown[] = [out]
    if (out && typeof out === "object") {
      const o = out as Record<string, unknown>
      candidates.push(o.content, o.result, o.output, o.patch, o.diff)
      if (typeof o.diff === "object" && o.diff !== null) candidates.push((o.diff as Record<string, unknown>).content)
    }
    for (const c of candidates) {
      if (typeof c === "string" && (c.includes("\n+") || c.includes("\n-") || c.startsWith("+") || c.startsWith("-"))) {
        return c
      }
    }
    return ""
  }

  const outputText = () => {
    const out = p.part.state?.output
    if (typeof out === "string") return out
    if (out && typeof out === "object") {
      const o = out as Record<string, unknown>
      if (typeof o.output === "string") return o.output
      if (typeof o.result === "string") return o.result
      if (typeof o.content === "string") return o.content
    }
    return ""
  }

  const showDiff = () => DIFF_TOOLS.has(p.part.tool) && diffText().trim().length > 0

  return (
    <div class="my-1 w-full min-w-0 max-w-full overflow-hidden rounded-md border border-[var(--border-strong)] border-l-2 border-l-[var(--accent)] bg-[var(--bg-panel)]">
      <button class="flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--bg-hover)]" onClick={() => setOpen(!open())}>
        <span class={`shrink-0 ${statusColor()}`}>
          {status() === "pending" ? "◌" : status() === "running" ? "●" : status() === "error" ? "✕" : "✓"}
        </span>
        <span class="shrink-0 font-medium text-[var(--text-primary)]">{label()}</span>
        <Show when={summary()}>
          <span class="min-w-0 flex-1 truncate text-[var(--text-muted)]">{summary()}</span>
        </Show>
        <span class={`ml-auto shrink-0 transition-transform ${open() ? "rotate-90" : ""}`}>›</span>
      </button>
      <Show when={open() && showDiff()}>
        <div class="min-w-0 border-t border-[var(--border-color)] p-2">
          <DiffView diff={diffText()} />
        </div>
      </Show>
      <Show when={open() && !showDiff() && outputText()}>
        <pre class="max-h-72 min-w-0 overflow-auto whitespace-pre-wrap border-t border-[var(--border-color)] px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
          {outputText()}
        </pre>
      </Show>
      <Show when={p.part.state?.error}>
        <pre class="max-h-72 min-w-0 overflow-auto whitespace-pre-wrap border-t border-[var(--border-color)] px-3 py-2 font-mono text-xs text-[var(--error)]">
          {p.part.state!.error}
        </pre>
      </Show>
    </div>
  )
}
