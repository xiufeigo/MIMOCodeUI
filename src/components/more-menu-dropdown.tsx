import { createSignal, For, Show, type Component } from "solid-js"
import { Archive, ArchiveRestore, FolderOpen, Link, Pin, Pencil, Trash2, ExternalLink, Check } from "lucide-solid"
import { AnchoredMenu } from "./overlay/anchored-menu"
import { useApp, useClient } from "../lib/store/provider"
import { useSessionPreferences } from "../lib/session-preferences"
import { useSessionArchive } from "../lib/session-archive"
import { invoke } from "@tauri-apps/api/core"

interface MoreMenuProps {
  sessionID: string
  /** 文件管理：切到该会话的文件树。 */
  onOpenFileTree?: (id: string) => void
  onDeleted?: (id: string) => void
  onRename?: (id: string) => void
  onClose: () => void
  reference: HTMLElement | null
  owner?: string
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end"
}

interface MenuItem {
  key: string
  label: string
  icon: Component<{ size?: number | string; class?: string }>
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

/** 中栏和左栏共用的 Trae 风格任务更多操作菜单。 */
export const MoreMenuDropdown: Component<MoreMenuProps> = (p) => {
  const { store } = useApp()
  const client = useClient()
  const { displayTitle, isPinned, togglePinned } = useSessionPreferences()
  const { isArchived, toggleSession } = useSessionArchive()
  const [copied, setCopied] = createSignal(false)
  const [confirmingDelete, setConfirmingDelete] = createSignal(false)

  const session = () => store.store.sessions[p.sessionID]
  const title = () => displayTitle(p.sessionID, session()?.title)
  const directory = () => session()?.directory
  const archived = () => isArchived(p.sessionID, directory())

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(`${title()}${directory() ? ` · ${directory()}` : ""}`)
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
        p.onClose()
      }, 900)
    } catch {
      p.onClose()
    }
  }

  async function handleReveal() {
    const dir = directory()
    if (!dir) return
    try {
      await invoke("open_in_explorer", { dir })
    } catch (error) {
      console.error("打开资源管理器失败", error)
    }
    p.onClose()
  }

  async function handleDelete() {
    const c = client()
    if (!c) return
    try {
      await c.deleteSession(p.sessionID)
      p.onDeleted?.(p.sessionID)
    } catch (error) {
      console.error("删除会话失败", error)
    }
    p.onClose()
  }

  const items = (): MenuItem[] => [
    {
      key: "pin",
      label: isPinned(p.sessionID) ? "取消置顶" : "置顶任务",
      icon: Pin,
      onClick: () => {
        togglePinned(p.sessionID)
        p.onClose()
      },
    },
    {
      key: "reveal",
      label: "在资源管理器打开",
      icon: ExternalLink,
      disabled: !directory(),
      onClick: () => void handleReveal(),
    },
    {
      key: "files",
      label: "文件管理",
      icon: FolderOpen,
      onClick: () => {
        p.onOpenFileTree?.(p.sessionID)
        p.onClose()
      },
    },
    {
      key: "share",
      label: copied() ? "已复制" : "分享",
      icon: () => (copied() ? <Check size={14} /> : <Link size={14} />),
      onClick: () => void handleShare(),
    },
    {
      key: "rename",
      label: "重命名任务",
      icon: Pencil,
      onClick: () => {
        p.onRename?.(p.sessionID)
        p.onClose()
      },
    },
    {
      key: "archive",
      label: archived() ? "取消归档" : "归档任务",
      icon: () => (archived() ? <ArchiveRestore size={16} /> : <Archive size={16} />),
      onClick: () => {
        toggleSession(p.sessionID)
        p.onClose()
      },
    },
  ]

  return (
    <AnchoredMenu open={true} reference={p.reference} onClose={p.onClose} ariaLabel="任务更多操作" owner={p.owner} placement={p.placement}>
      <Show
        when={!confirmingDelete()}
        fallback={
          <div class="px-3 py-2">
            <p class="mb-2 text-xs text-[var(--text-secondary)]">确定删除此任务？</p>
            <div class="flex justify-end gap-2">
              <button
                class="rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                onClick={() => setConfirmingDelete(false)}
              >
                取消
              </button>
              <button class="rounded bg-[var(--error)] px-2 py-1 text-xs text-white hover:opacity-90" onClick={() => void handleDelete()}>
                删除
              </button>
            </div>
          </div>
        }
      >
        <For each={items()}>
          {(item) => (
            <button
              class={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                item.disabled
                  ? "cursor-not-allowed text-[var(--text-muted)] opacity-50"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              }`}
              disabled={item.disabled}
              onClick={item.onClick}
              title={item.disabled ? "任务未关联本地目录" : undefined}
              role="menuitem"
            >
              <item.icon size={16} class="shrink-0" />
              <span>{item.label}</span>
            </button>
          )}
        </For>
        <div class="my-1 border-t border-[var(--border-color)]" />
        <button
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--error)] transition-colors hover:bg-[var(--bg-hover)]"
          onClick={() => setConfirmingDelete(true)}
          role="menuitem"
        >
          <Trash2 size={16} />
          <span>删除任务</span>
        </button>
      </Show>
    </AnchoredMenu>
  )
}
