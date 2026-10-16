import { Show, type Component } from "solid-js"
import { FolderTree } from "lucide-solid"
import { useApp } from "../../../lib/store/provider"
import { FileTree } from "../../files/file-tree"

export interface FilesSectionProps {
  /** 当前会话 id；目录取自会话信息，未选会话时显示占位。 */
  sessionID: string | null
  /** FileTree 顶部「返回项目列表」在右栏里没有项目列表，改为回到上一个入口。 */
  onBack: () => void
}

/**
 * 右栏「文件」段：复用左栏的 FileTree。
 * 右栏只读浏览（canWrite 恒为 false），新建文件仍由左栏负责。
 */
export const FilesSection: Component<FilesSectionProps> = (p) => {
  const { store } = useApp()
  const root = () => (p.sessionID ? (store.store.sessions[p.sessionID]?.directory ?? "") : "")

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <Show
        when={p.sessionID}
        fallback={
          <div class="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-raised)] text-[var(--text-muted)]">
              <FolderTree size={18} />
            </span>
            <p class="text-xs text-[var(--text-secondary)]">请先选择一个任务</p>
            <p class="max-w-[16rem] text-[10px] leading-relaxed text-[var(--text-muted)]">选中任务后即可在这里浏览它的工作区目录。</p>
          </div>
        }
      >
        <FileTree root={root()} onBack={p.onBack} canWrite={false} />
      </Show>
    </div>
  )
}
