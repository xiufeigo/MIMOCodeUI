import { Archive, ArchiveRestore, ExternalLink, FolderPlus, Trash2 } from "lucide-solid"
import { AnchoredMenu } from "./overlay/anchored-menu"
import { invoke } from "@tauri-apps/api/core"
import { useSessionArchive } from "../lib/session-archive"
import type { Component } from "solid-js"

interface DirectoryMenuDropdownProps {
  directory?: string
  onCreate: (directory?: string) => void
  onClose: () => void
  reference: HTMLElement | null
  owner?: string
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end"
}

/** 目录组菜单：创建任务和打开资源管理器可用；删除目录保持禁用以保护用户文件。 */
export const DirectoryMenuDropdown: Component<DirectoryMenuDropdownProps> = (p) => {
  const { isDirectoryArchived, toggleDirectory } = useSessionArchive()
  const archived = () => isDirectoryArchived(p.directory)

  async function reveal() {
    if (!p.directory) return
    try {
      await invoke("open_in_explorer", { dir: p.directory })
    } catch (error) {
      console.error("打开资源管理器失败", error)
    }
    p.onClose()
  }

  const itemClass = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"

  return (
    <AnchoredMenu open={true} reference={p.reference} onClose={p.onClose} ariaLabel="目录更多操作" owner={p.owner} placement={p.placement}>
      <button
        class={itemClass}
        onClick={() => {
          p.onCreate(p.directory)
          p.onClose()
        }}
        role="menuitem"
      >
        <FolderPlus size={16} />
        <span>创建新任务</span>
      </button>
      <button class={itemClass} disabled={!p.directory} onClick={() => void reveal()} role="menuitem">
        <ExternalLink size={16} />
        <span>在资源管理器打开</span>
      </button>
      <button
        class={itemClass}
        onClick={() => {
          toggleDirectory(p.directory)
          p.onClose()
        }}
        role="menuitem"
      >
        {archived() ? <ArchiveRestore size={16} /> : <Archive size={16} />}
        <span>{archived() ? "取消归档文件夹" : "归档文件夹"}</span>
      </button>
      <button
        class="flex w-full cursor-not-allowed items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text-muted)] opacity-50"
        disabled
        title="目录由用户文件系统管理，当前不可删除"
        role="menuitem"
      >
        <Trash2 size={16} />
        <span>删除文件夹</span>
      </button>
    </AnchoredMenu>
  )
}
