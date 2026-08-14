import { createSignal, For, Show, type Component, type JSX } from "solid-js"
import { Image as ImageIcon, Paperclip, Send, X } from "lucide-solid"
import { useApp, useClient } from "../../lib/store/provider"
import { parsePromptModel } from "../../lib/new-task"
import { baseName, dataUrlForImage, fileUrlForPath, isImageMime, mimeForPath, type PromptPart } from "../../lib/attachment"
import { isTauriEnv, pickFiles, readFileBase64 } from "../../lib/file-access"
import { AgentSelector, ModelSelector, ReasoningEffortSelector } from "./selectors"
import { SlashCommandMenu } from "./slash-menu"
import { activeSlash, filterSlashCommands, type SlashCommand } from "./slash-commands"
import type { PromptModelOption, ReasoningEffort, ReasoningEffortOption } from "./types"
import type { AgentInfo } from "../../lib/protocol/types"

export type { PromptModelOption }

export interface PromptInputProps {
  sessionID?: string
  agent?: string
  model?: string
  reasoningEffort?: ReasoningEffort
  /** 思考强度选项（由当前模型 variants 生成；缺省回退五档）。 */
  effortOptions?: ReasoningEffortOption[]
  agents?: AgentInfo[]
  models?: PromptModelOption[]
  onAgentChange?: (agent: string | undefined) => void
  onModelChange?: (model: string | undefined) => void
  onReasoningEffortChange?: (effort: ReasoningEffort) => void
  onSubmitNewTask?: (request: { text: string; agent?: string; model?: string; variant?: string; parts?: PromptPart[] }) => Promise<void>
  onDraftChange?: (text: string) => void
  draft?: string
  placeholder?: string
  class?: string
  disabled?: boolean
  /** 子智能体会话的父会话 id（非空时该输入框只读，仅显示「返回主会话」）。 */
  parentSessionID?: string | null
  /** 点击「返回主会话」时跳转父会话。 */
  onReturnToParent?: () => void
}

type SelectKind = "agent" | "model" | "effort" | null

/** OpenCode-style composer for both existing sessions and the new-task workspace. */
export const PromptInput: Component<PromptInputProps> = (p) => {
  const { store } = useApp()
  const client = useClient()
  const [internalText, setInternalText] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [attachments, setAttachments] = createSignal<PromptPart[]>([])
  const [openSelect, setOpenSelect] = createSignal<SelectKind>(null)
  const [slashOpen, setSlashOpen] = createSignal(false)
  const [slashQuery, setSlashQuery] = createSignal("")
  const [slashIndex, setSlashIndex] = createSignal(0)
  let textareaEl: HTMLTextAreaElement | undefined
  const text = () => p.draft ?? internalText()
  const sessionBusy = () => (p.sessionID ? store.store.status[p.sessionID]?.type === "busy" : false)

  function updateText(value: string) {
    if (p.draft === undefined) setInternalText(value)
    p.onDraftChange?.(value)
  }

  function updateSlash(value: string, cursor: number) {
    const active = activeSlash(value, cursor)
    if (!active) {
      setSlashOpen(false)
      setSlashQuery("")
      return
    }
    setSlashQuery(active.query)
    setSlashIndex(0)
    setSlashOpen(true)
  }

  function insertSlashCommand(command: SlashCommand) {
    const value = text()
    const cursor = textareaEl?.selectionStart ?? value.length
    const active = activeSlash(value, cursor)
    if (!active) {
      setSlashOpen(false)
      return
    }
    const next = value.slice(0, active.start) + command.insert + value.slice(cursor)
    updateText(next)
    setSlashOpen(false)
    setSlashQuery("")
    queueMicrotask(() => {
      if (!textareaEl) return
      textareaEl.focus()
      const pos = active.start + command.insert.length
      textareaEl.setSelectionRange(pos, pos)
    })
  }

  function addParts(next: PromptPart[]) {
    setAttachments((previous) => [...previous, ...next])
  }

  async function attachFiles() {
    if (!isTauriEnv()) {
      setError("请在桌面客户端中上传文件")
      return
    }
    try {
      const paths = await pickFiles()
      const parts: PromptPart[] = paths.map((path) => ({
        type: "file",
        mime: mimeForPath(path),
        url: fileUrlForPath(path),
        filename: baseName(path),
      }))
      addParts(parts)
    } catch (cause) {
      setError((cause as Error).message)
    }
  }

  async function attachImagesFromPaths(paths: string[]) {
    const parts: PromptPart[] = []
    for (const path of paths) {
      const mime = mimeForPath(path)
      if (!isImageMime(mime)) continue
      try {
        const b64 = await readFileBase64(path)
        parts.push({ type: "file", mime, url: dataUrlForImage(mime, b64), filename: baseName(path) })
      } catch (cause) {
        setError((cause as Error).message)
      }
    }
    addParts(parts)
  }

  async function attachImages() {
    if (!isTauriEnv()) {
      setError("请在桌面客户端中上传图片")
      return
    }
    try {
      const paths = await pickFiles()
      await attachImagesFromPaths(paths)
    } catch (cause) {
      setError((cause as Error).message)
    }
  }

  function addImageFile(file: File) {
    if (!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : ""
      if (url) addParts([{ type: "file", mime: file.type || "image/png", url, filename: file.name }])
    }
    reader.readAsDataURL(file)
  }

  function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? [])
    for (const file of files) addImageFile(file)
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    const files = Array.from(event.dataTransfer?.files ?? [])
    for (const file of files) addImageFile(file)
  }

  function removeAttachment(index: number) {
    setAttachments((previous) => previous.filter((_, i) => i !== index))
  }

  async function submit() {
    const value = text().trim()
    if (!value || busy() || p.disabled) return
    setBusy(true)
    setError(null)
    const variant = p.reasoningEffort && p.reasoningEffort !== "default" ? p.reasoningEffort : undefined
    const parts: PromptPart[] = [{ type: "text", text: value }, ...attachments()]
    try {
      if (p.onSubmitNewTask) {
        await p.onSubmitNewTask({ text: value, agent: p.agent, model: p.model, variant, parts })
      } else if (p.sessionID) {
        const c = client()
        if (!c) throw new Error("服务器未连接")
        await c.promptAsync(p.sessionID, {
          parts,
          agent: p.agent,
          model: parsePromptModel(p.model),
          variant,
        })
      }
      updateText("")
      setAttachments([])
      setSlashOpen(false)
      setSlashQuery("")
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function abort() {
    if (!p.sessionID) return
    const c = client()
    if (!c) return
    try {
      await c.abort(p.sessionID)
    } catch (cause) {
      console.error("abort failed", cause)
    }
  }

  return (
    <div class={p.class ?? "border-t border-[var(--border-color)] bg-[var(--bg-panel)] px-4 pb-3 pt-2"}>
      <div class="mx-auto flex max-w-4xl flex-col gap-1.5">
        <Show when={p.parentSessionID != null && p.parentSessionID !== ""}>
          <div class="flex items-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3">
            <p class="flex-1 text-sm text-[var(--text-muted)]">无法向子智能体会话发送提示词。</p>
            <button
              class="shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)]"
              onClick={() => p.onReturnToParent?.()}
            >
              返回主会话
            </button>
          </div>
        </Show>
        <Show when={p.parentSessionID == null || p.parentSessionID === ""}>
        <Show when={error()}>
          <p class="text-xs text-[var(--error)]">{error()}</p>
        </Show>

        <Show when={attachments().length > 0}>
          <div class="flex min-w-0 flex-wrap items-start gap-2 px-1">
            <For each={attachments()}>
              {(part, index) => (
                <div class="group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--border-color)] bg-[var(--bg-raised)]">
                  {part.type === "file" && isImageMime(part.mime) ? (
                    <img src={part.url} alt={part.filename ?? "图片"} class="h-full w-full object-cover" />
                  ) : (
                    <span class="max-w-full truncate px-1 text-[10px] text-[var(--text-secondary)]">{part.type === "file" ? part.filename : ""}</span>
                  )}
                  <button
                    class="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-white opacity-0 group-hover:opacity-100"
                    aria-label="移除附件"
                    onClick={() => removeAttachment(index())}
                  >
                    <X size={10} />
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div
          class="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-input)] focus-within:border-[var(--accent)]"
          onDrop={handleDrop}
        >
          <div class="flex items-end gap-2 px-3 py-2">
            <textarea
              ref={(el) => (textareaEl = el)}
              class="max-h-40 min-h-[38px] flex-1 resize-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              placeholder={p.placeholder ?? "描述你的任务，或 @ 提及 Agent…"}
              rows={1}
              value={text()}
              disabled={p.disabled}
              onInput={(event) => {
                const el = event.currentTarget
                updateText(el.value)
                updateSlash(el.value, el.selectionStart ?? el.value.length)
              }}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if (slashOpen()) {
                  const list = filterSlashCommands(slashQuery())
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault()
                    if (list.length > 0) {
                      setSlashIndex((i) => (event.key === "ArrowDown" ? (i + 1) % list.length : (i - 1 + list.length) % list.length))
                    }
                    return
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    const command = list[slashIndex()]
                    if (command) {
                      event.preventDefault()
                      insertSlashCommand(command)
                    }
                    return
                  }
                  if (event.key === "Escape") {
                    event.preventDefault()
                    setSlashOpen(false)
                    return
                  }
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void submit()
                }
              }}
            />
            <Show when={sessionBusy()} fallback={<SendButton onClick={submit} disabled={p.disabled || busy() || !text().trim()} />}>
              <button class="rounded-md bg-[var(--error)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90" onClick={() => void abort()} title="停止运行">
                停止
              </button>
            </Show>
          </div>

          <div class="flex min-w-0 flex-wrap items-center gap-1 border-t border-[var(--border-color)] px-3 py-1.5">
            <ToolIconBtn label="添加文件" icon={<Paperclip size={15} />} disabled={p.disabled} onClick={() => void attachFiles()} />
            <ToolIconBtn label="添加图片" icon={<ImageIcon size={15} />} disabled={p.disabled} onClick={() => void attachImages()} />
            <Show when={(p.agents?.length ?? 0) > 0}>
              <AgentSelector
                agent={p.agent}
                agents={p.agents ?? []}
                open={openSelect() === "agent"}
                disabled={p.disabled}
                onOpenChange={(open) => setOpenSelect(open ? "agent" : null)}
                onSelect={(name) => p.onAgentChange?.(name)}
              />
            </Show>
            <Show when={(p.models?.length ?? 0) > 0}>
              <ModelSelector
                model={p.model}
                models={p.models ?? []}
                open={openSelect() === "model"}
                disabled={p.disabled}
                onOpenChange={(open) => setOpenSelect(open ? "model" : null)}
                onSelect={(model) => p.onModelChange?.(model)}
              />
            </Show>
            <ReasoningEffortSelector
              value={p.reasoningEffort ?? "default"}
              effortOptions={p.effortOptions}
              open={openSelect() === "effort"}
              disabled={p.disabled}
              onOpenChange={(open) => setOpenSelect(open ? "effort" : null)}
              onSelect={(value) => p.onReasoningEffortChange?.(value)}
            />
          </div>
        </div>

        <SlashCommandMenu
          open={slashOpen()}
          reference={textareaEl ?? null}
          query={slashQuery()}
          selectedIndex={slashIndex()}
          onSelect={(command) => insertSlashCommand(command)}
          onHover={(index) => setSlashIndex(index)}
          onClose={() => setSlashOpen(false)}
        />
        </Show>
      </div>
    </div>
  )
}

function SendButton(props: { onClick: () => void; disabled: boolean }) {
  return (
    <button class="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40" disabled={props.disabled} onClick={props.onClick} title="发送" aria-label="发送">
      <Send size={16} />
    </button>
  )
}

const ToolIconBtn: Component<{ label: string; icon: JSX.Element; onClick?: () => void; disabled?: boolean }> = (p) => (
  <button
    class="flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
    title={p.label}
    aria-label={p.label}
    disabled={p.disabled}
    onClick={p.onClick}
  >
    {p.icon}
  </button>
)
