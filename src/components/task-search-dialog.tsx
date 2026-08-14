import { createEffect, createMemo, createSignal, For, Show, untrack, type Component } from "solid-js"
import { Folder, MessageSquare, Pin, Search } from "lucide-solid"
import { useApp, useClient } from "../lib/store/provider"
import { useSessionPreferences } from "../lib/session-preferences"
import { ModalDialog } from "./overlay/modal-dialog"
import type { SessionMessage } from "../lib/protocol/types"

interface TaskSearchDialogProps {
  open: boolean
  sessionIDs: string[]
  onOpenSession: (id: string) => void
  onClose: () => void
}

/** 全局任务检索：初始列出全部任务，按标题、目录和消息内容过滤。 */
export const TaskSearchDialog: Component<TaskSearchDialogProps> = (p) => {
  const { store } = useApp()
  const client = useClient()
  const { displayTitle, isPinned } = useSessionPreferences()
  const [query, setQuery] = createSignal("")
  const [contentIndex, setContentIndex] = createSignal<Record<string, string>>({})
  const [searchingContent, setSearchingContent] = createSignal(false)
  let inputEl: HTMLInputElement | undefined
  let searchVersion = 0

  createEffect(() => {
    if (!p.open) return
    setQuery("")
    queueMicrotask(() => inputEl?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") p.onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  })

  // 协议没有服务端会话检索接口。输入后以有限并发加载未缓存历史，并复用正文索引。
  createEffect(() => {
    const needle = query().trim()
    const c = client()
    if (!p.open || !needle || !c) {
      searchVersion++
      setSearchingContent(false)
      return
    }

    const indexed = untrack(contentIndex)
    const missing = p.sessionIDs.filter((id) => store.store.messages[id] === undefined && indexed[id] === undefined)
    if (missing.length === 0) {
      setSearchingContent(false)
      return
    }

    const version = ++searchVersion
    let nextIndex = 0
    setSearchingContent(true)
    const load = async () => {
      while (nextIndex < missing.length) {
        const id = missing[nextIndex++]
        try {
          const messages = await c.messages(id)
          if (version !== searchVersion) return
          setContentIndex((previous) => ({ ...previous, [id]: messageText(messages) }))
        } catch {
          if (version !== searchVersion) return
          setContentIndex((previous) => ({ ...previous, [id]: "" }))
        }
      }
    }
    const timer = window.setTimeout(() => {
      void Promise.all(Array.from({ length: Math.min(4, missing.length) }, load)).finally(() => {
        if (version === searchVersion) setSearchingContent(false)
      })
    }, 200)

    return () => {
      window.clearTimeout(timer)
      if (version === searchVersion) searchVersion++
    }
  })

  const matchedSessions = createMemo(() => {
    const needle = query().trim().toLowerCase()
    const indexed = contentIndex()
    return p.sessionIDs.filter((id) => {
      const session = store.store.sessions[id]
      if (!session) return false
      if (!needle) return true
      const hydratedMessages = store.store.messages[id]
      const content = hydratedMessages ? messageText(hydratedMessages) : indexed[id] ?? ""
      return [displayTitle(id, session.title), session.title, session.directory, content].some((value) =>
        value.toLowerCase().includes(needle),
      )
    })
  })

  function select(id: string) {
    p.onOpenSession(id)
    p.onClose()
  }

  return (
    <ModalDialog open={p.open} title="搜索任务" onClose={p.onClose} class="w-full max-w-xl">
      <section class="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xl">
        <div class="flex items-center gap-2 border-b border-[var(--border-color)] px-4 py-3">
          <Search size={16} class="shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputEl}
            class="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            placeholder="搜索任务名称及内容"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <kbd class="rounded border border-[var(--border-color)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">Esc</kbd>
        </div>
        <div class="max-h-[min(20rem,calc(100dvh-10rem))] overflow-y-auto p-2">
          <For each={matchedSessions()}>
            {(id) => {
              const session = () => store.store.sessions[id]
              return (
                <button
                  class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                  onClick={() => select(id)}
                >
                  <MessageSquare size={15} class="shrink-0 text-[var(--text-muted)]" />
                  <span class="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
                    {displayTitle(id, session()?.title)}
                  </span>
                  <Show when={isPinned(id)}>
                    <Pin size={13} class="shrink-0 text-[var(--accent)]" />
                  </Show>
                  <span class="flex max-w-40 shrink-0 items-center gap-1 truncate text-xs text-[var(--text-muted)]">
                    <Folder size={13} class="shrink-0" />
                    {directoryLabel(session()?.directory)}
                  </span>
                </button>
              )
            }}
          </For>
          <Show when={searchingContent()}>
            <p class="px-3 py-2 text-xs text-[var(--text-muted)]">正在检索任务内容...</p>
          </Show>
          <Show when={matchedSessions().length === 0 && !searchingContent()}>
            <p class="px-3 py-8 text-center text-sm text-[var(--text-muted)]">未找到匹配任务</p>
          </Show>
        </div>
      </section>
    </ModalDialog>
  )
}

function messageText(messages: SessionMessage[]): string {
  return messages
    .flatMap((message) =>
      message.parts.flatMap((part) => ("text" in part && typeof part.text === "string" ? [part.text] : [])),
    )
    .join("\n")
    .toLowerCase()
}

function directoryLabel(directory: string | undefined): string {
  if (!directory) return "未分类"
  const parts = directory.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? directory
}
