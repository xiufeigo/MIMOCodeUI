import { createMemo, createSignal, For, Show, type Component, type JSX } from "solid-js"
import { Archive, ChevronRight, Folder, FolderOpen, ListTree, MoreHorizontal, Pin, Plus, Store } from "lucide-solid"
import { useApp } from "../../lib/store/provider"
import { useSessionPreferences } from "../../lib/session-preferences"
import { MoreMenuDropdown } from "../more-menu-dropdown"
import { DirectoryMenuDropdown } from "../directory-menu-dropdown"
import { FileTree } from "../files/file-tree"
import { ContextFooter } from "./context-footer"
import { DirectoryPicker } from "../directory-picker"

export interface LeftNavProps {
  sessions: string[]
  active: string | null
  onOpen: (id: string | null) => void
  onCreate: (directory?: string) => void
  creating: boolean
  connected: boolean
  onDeleted?: (id: string) => void
  onRename?: (id: string) => void
  /** 展开时由工作区提供的可调整宽度。 */
  width?: number
  /** 展开/折叠（折叠时仅图标）。 */
  expanded: boolean
  onToggleExpanded: () => void
  /** 当前选中的导航项（由 workspace 控制，切换中间区内容）。 */
  navSel: string
  onSelectNav: (id: string) => void
  /** 点击会话行的「文件管理」图标，左栏切换为该项目的文件目录树。 */
  onOpenFileTree?: (id: string) => void
  /** 点击目录分组行的「文件管理」图标，按目录打开文件树（不切换会话）。 */
  onOpenDirectoryFileTree?: (directory: string | undefined) => void
  /** Whether this navigation is currently rendered as a temporary drawer. */
  drawer?: boolean
  /** 打开设置（底部用户区齿轮）。 */
  onOpenSettings?: () => void
  /** 激活的文件树根目录（非 null 时任务列表区域替换为文件树）。 */
  fileTreeRoot?: string | null
  /** 关闭文件树，返回任务列表。 */
  onCloseFileTree?: () => void
  /** 文件树是否允许新建（仅本地 Tauri 后端）。 */
  canWriteFiles?: boolean
  /** 当前是否处于「归档任务列表」模式。 */
  archiveMode?: boolean
  /** 在任务列表与归档任务列表之间切换。 */
  onToggleArchiveMode?: () => void
  /** 当前工作区目录（打开工作区后非空）。 */
  workspaceDirectory?: string | null
  /** 打开/切换工作区：传入目录时载入其历史任务流程，传入 undefined 时清除工作区。 */
  onOpenWorkspace?: (directory: string | undefined) => void
}

/** 目录显示名。 */
function dirLabel(dir: string | undefined): string {
  if (!dir) return "未分类"
  const parts = dir.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? dir
}

/** 按文件夹分组。 */
function groupByDirectory(
  sessionIDs: string[],
  getDir: (id: string) => string | undefined,
): { key: string; label: string; ids: string[] }[] {
  const order: string[] = []
  const map = new Map<string, { key: string; label: string; ids: string[] }>()
  for (const id of sessionIDs) {
    const dir = getDir(id)
    const key = dir ?? ""
    let group = map.get(key)
    if (!group) {
      group = { key, label: dirLabel(dir), ids: [] }
      map.set(key, group)
      order.push(key)
    }
    group.ids.push(id)
  }
  return order.map((key) => map.get(key)!)
}

/** 会话树节点（子 agent 挂在主 agent 下）。 */
interface SessionTreeNode {
  id: string
  children: SessionTreeNode[]
}

/** 依据 parentID 把会话列表构建成树；parentID 缺失或不在可见集合内则为根。 */
function buildSessionTree(ids: string[], parentOf: (id: string) => string | null): SessionTreeNode[] {
  const byId = new Map<string, SessionTreeNode>()
  for (const id of ids) byId.set(id, { id, children: [] })
  const roots: SessionTreeNode[] = []
  const idsSet = new Set(ids)
  for (const id of ids) {
    const node = byId.get(id)!
    const parent = parentOf(id)
    if (parent && parent !== id && idsSet.has(parent)) {
      byId.get(parent)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

/** 树形缩进单元（单位 px，均为盒宽/中心）。 */
const DOT_BOX = 16 // 圆点框宽
const ARROW_BOX = 16 // 箭头框宽
const BRANCH_W = 22 // 分支水平长度：父箭头中心 → 子圆点中心
const ROW_H = 16 // 树形列高度（与行内对齐）
const MID = ROW_H / 2 // 8

/** 每一级祖先的「脊椎」列：箭头中心 x + 是否向下延续（非末位兄弟）。 */
interface Spine {
  x: number
  continues: boolean
}

const NAV_ITEMS = [
  { id: "tasks", icon: Plus, label: "新建任务" },
  { id: "plugins", icon: Store, label: "插件市场" },
]

/** 依据深度与祖先脊椎（guides.length === depth）计算当前节点的分支/圆点/箭头中心 x。 */
function nodeGeometry(depth: number, guides: Spine[]): { branchX: number; dotX: number; arrowX: number } {
  const branchX = depth >= 1 ? guides[depth - 1].x : 0 // 父箭头中心
  const dotX = depth >= 1 ? branchX + BRANCH_W : DOT_BOX / 2 // 圆点中心
  const arrowX = dotX + DOT_BOX // 箭头中心 = 圆点中心 + 圆点框宽
  return { branchX, dotX, arrowX }
}

/** Trae 风格任务栏：目录与任务均有明确的双操作按钮。 */
export const LeftNav: Component<LeftNavProps> = (p) => {
  const { store, activeProfile } = useApp()
  const { displayTitle, isPinned } = useSessionPreferences()
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set())
  const [expandedSessions, setExpandedSessions] = createSignal<Set<string>>(new Set())
  const [directoryMenu, setDirectoryMenu] = createSignal<string | null>(null)
  const [directoryMenuReference, setDirectoryMenuReference] = createSignal<HTMLElement | null>(null)
  const [taskMenu, setTaskMenu] = createSignal<string | null>(null)
  const [taskMenuReference, setTaskMenuReference] = createSignal<HTMLElement | null>(null)
  const [workspacePickerOpen, setWorkspacePickerOpen] = createSignal(false)

  const title = (id: string) => displayTitle(id, store.store.sessions[id]?.title)
  const status = (id: string) => store.store.status[id]
  const dirOf = (id: string) => store.store.sessions[id]?.directory
  const parentOf = (id: string) => store.store.sessions[id]?.parentID ?? null
  const groups = createMemo(() => groupByDirectory(p.sessions, dirOf))
  const expand = () => p.expanded

  function toggleGroup(key: string) {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSessionExpand(id: string) {
    setExpandedSessions((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function closeMenus() {
    setDirectoryMenu(null)
    setDirectoryMenuReference(null)
    setTaskMenu(null)
    setTaskMenuReference(null)
  }

  const iconButton =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"

  /** 渲染单条会话行：树形连线用 CSS 边框绘制（圆点在前、展开箭头在圆点后）。 */
  function sessionRow(node: SessionTreeNode, depth: number, guides: Spine[]): JSX.Element {
    const id = node.id
    const hasChildren = node.children.length > 0
    const isExpanded = () => expandedSessions().has(id)
    const { branchX, dotX, arrowX } = nodeGeometry(depth, guides)
    const treeWidth = (hasChildren ? arrowX + ARROW_BOX / 2 : dotX + DOT_BOX / 2)

    return (
      <div
        class={`group flex h-9 items-center rounded-md py-1 pl-2 pr-2 text-sm transition-colors ${
          p.active === id
            ? "bg-[var(--bg-raised)] text-[var(--accent)]"
            : "text-black hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
        }`}
      >
        <div class="relative shrink-0" style={{ width: `${treeWidth}px`, height: `${ROW_H}px` }}>
          {/* 祖先脊椎列（level 0..depth-2）：continues 时整行贯穿 */}
          {guides.slice(0, Math.max(0, depth - 1)).map((guide) =>
            guide.continues ? (
              <span
                class="absolute top-0 bottom-0 w-px bg-[var(--border-strong)]"
                style={{ left: `${guide.x}px` }}
              />
            ) : null,
          )}
          {/* 父级列（depth>=1）：竖线（非末位贯穿到底，末位到中线）+ 中线水平分支 */}
          <Show when={depth >= 1}>
            <span
              class="absolute w-px bg-[var(--border-strong)]"
              style={{ left: `${branchX}px`, top: 0, height: `${guides[depth - 1]?.continues ? ROW_H : MID}px` }}
            />
            <span
              class="absolute h-px bg-[var(--border-strong)]"
              style={{ left: `${branchX}px`, top: `${MID}px`, width: `${dotX - branchX}px` }}
            />
          </Show>
          {/* 圆点（置顶/状态） */}
          <span class="absolute top-0 flex h-4 w-4 items-center justify-center" style={{ left: `${dotX - DOT_BOX / 2}px` }}>
            <Show
              when={isPinned(id)}
              fallback={
                <span
                  class={`h-1.5 w-1.5 rounded-full ${
                    status(id)?.type === "busy" ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"
                  }`}
                />
              }
            >
              <Pin size={13} class="text-[var(--accent)]" />
            </Show>
          </span>
          {/* 展开箭头（有子智能体时显示，位于圆点后） */}
          <Show when={hasChildren}>
            <button
              class="absolute top-0 flex h-4 w-4 items-center justify-center rounded-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              style={{ left: `${arrowX - ARROW_BOX / 2}px` }}
              onClick={() => toggleSessionExpand(id)}
              aria-label={isExpanded() ? "折叠子智能体" : "展开子智能体"}
              aria-expanded={isExpanded()}
            >
              <ChevronRight size={12} class={`transition-transform ${isExpanded() ? "rotate-90" : ""}`} />
            </button>
          </Show>
        </div>
        <button
          class="flex min-w-0 flex-1 items-center pl-1 text-left"
          onClick={() => p.onOpen(id)}
          aria-current={p.active === id ? "page" : undefined}
        >
          <span class="min-w-0 flex-1 truncate">{title(id)}</span>
        </button>
        <div>
          <button
            class={iconButton}
            title="更多操作"
            aria-label="更多操作"
            aria-expanded={taskMenu() === id}
            onClick={(event) => {
              event.stopPropagation()
              setDirectoryMenu(null)
              setDirectoryMenuReference(null)
              const nextOpen = taskMenu() !== id
              setTaskMenu(nextOpen ? id : null)
              setTaskMenuReference(nextOpen ? event.currentTarget : null)
            }}
          >
            <MoreHorizontal size={15} />
          </button>
          <Show when={taskMenu() === id}>
            <MoreMenuDropdown
              sessionID={id}
              reference={taskMenuReference()}
              onOpenFileTree={p.onOpenFileTree}
              onDeleted={p.onDeleted}
              onRename={p.onRename}
              onClose={closeMenus}
              owner={p.drawer ? "left-sidebar" : undefined}
              placement="bottom-start"
            />
          </Show>
        </div>
      </div>
    )
  }

  /** 递归渲染会话树：guides 记录每级祖先箭头中心 + 是否延续；子节点默认折叠。 */
  function renderTree(nodes: SessionTreeNode[], depth: number, guides: Spine[]): JSX.Element[] {
    const out: JSX.Element[] = []
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const isLast = i === nodes.length - 1
      // 本节点在各祖先列的「延续」标记：父级列（depth-1）取决于本节点是否末位。
      const nodeGuides = guides.map((guide, index) =>
        index === depth - 1 ? { x: guide.x, continues: !isLast } : guide,
      )
      out.push(sessionRow(node, depth, nodeGuides))
      if (node.children.length > 0 && expandedSessions().has(node.id)) {
        const { arrowX } = nodeGeometry(depth, nodeGuides)
        out.push(...renderTree(node.children, depth + 1, [...nodeGuides, { x: arrowX, continues: false }]))
      }
    }
    return out
  }

  return (
    <aside
      class="flex h-full min-h-0 flex-1 flex-col bg-[var(--bg-app)] transition-[width] duration-150"
      style={{ width: `${expand() ? p.width ?? 240 : 64}px` }}
    >
      <div class={`flex h-12 items-center border-b border-[var(--border-color)] ${expand() ? "px-3" : "justify-center"}`}>
        {expand() ? (
          <span class="text-sm font-bold text-[var(--text-primary)]">MIMO Code UI</span>
        ) : (
          <span class="text-sm font-bold text-[var(--accent)]">M</span>
        )}
      </div>

      <div class="flex flex-col gap-0.5 border-b border-[var(--border-color)] p-2">
        <For each={NAV_ITEMS}>
          {(item) => (
            <button
              class={`flex items-center rounded-md py-1.5 text-sm transition-colors ${
                expand() ? "gap-2.5 px-2" : "justify-center px-0"
              } ${
                p.navSel === item.id
                  ? "bg-[var(--bg-raised)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
              }`}
              onClick={() => p.onSelectNav(item.id)}
              title={item.label}
            >
              <item.icon size={16} class="shrink-0" />
              <Show when={expand()}>
                <span class="truncate">{item.label}</span>
              </Show>
            </button>
          )}
        </For>
      </div>

      <div class="flex min-h-0 flex-1 flex-col">
        <Show
          when={p.fileTreeRoot == null}
          fallback={<FileTree root={p.fileTreeRoot ?? ""} onBack={() => p.onCloseFileTree?.()} canWrite={p.canWriteFiles ?? false} />}
        >
          <div class={`flex shrink-0 items-center border-b border-[var(--border-color)] py-1.5 ${expand() ? "justify-between px-3" : "justify-center"}`}>
            <Show when={expand()} fallback={<ListTree size={15} class="text-[var(--text-muted)]" />}>
              <>
                <span class="min-w-0 truncate text-xs font-semibold text-[var(--text-secondary)]">
                  {p.archiveMode ? "归档任务列表" : "任务列表"}
                </span>
                <div class="flex shrink-0 items-center gap-0.5">
                  {/* 打开工作区：选择文件夹后按目录载入历史任务 */}
                  <DirectoryPicker
                    profile={activeProfile()}
                    value={p.workspaceDirectory ?? undefined}
                    placeholder="打开工作区"
                    showBasename
                    open={workspacePickerOpen()}
                    disabled={!p.connected}
                    onOpenChange={(open) => setWorkspacePickerOpen(open)}
                    onChange={(dir) => p.onOpenWorkspace?.(dir)}
                  />
                  <button
                    class="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                    title={p.archiveMode ? "返回任务列表" : "查看归档任务"}
                    aria-label={p.archiveMode ? "返回任务列表" : "查看归档任务"}
                    onClick={() => p.onToggleArchiveMode?.()}
                  >
                    <Archive size={14} />
                  </button>
                </div>
              </>
            </Show>
          </div>

          <div class="flex-1 overflow-y-auto py-1">
            <For each={groups()}>
              {(group) => {
                const isCollapsed = () => collapsed().has(group.key)
                const directory = () => group.key || undefined
                return (
                  <section>
                    <div
                      class={`group flex h-8 items-center gap-1.5 text-xs font-medium text-black ${
                        expand() ? "px-2" : "justify-center px-0"
                      }`}
                    >
                      <button
                        class={`flex min-w-0 items-center gap-1.5 rounded py-1 hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] ${
                          expand() ? "flex-1 px-1 text-left" : "justify-center px-0"
                        }`}
                        onClick={() => (expand() ? toggleGroup(group.key) : p.onToggleExpanded())}
                        title={group.label}
                      >
                        <Show when={expand()} fallback={<Folder size={15} />}>
                          <ChevronRight size={14} class={`shrink-0 transition-transform ${isCollapsed() ? "" : "rotate-90"}`} />
                          <Folder size={14} class="shrink-0" />
                          <span class="min-w-0 flex-1 truncate">{group.label}</span>
                          <span class="shrink-0">{group.ids.length}</span>
                        </Show>
                      </button>
                      <Show when={expand()}>
                        <div>
                          <button
                            class={iconButton}
                            title="更多操作"
                            aria-label="更多操作"
                            aria-expanded={directoryMenu() === group.key}
                            onClick={(event) => {
                              event.stopPropagation()
                              setTaskMenu(null)
                              setTaskMenuReference(null)
                              const nextOpen = directoryMenu() !== group.key
                              setDirectoryMenu(nextOpen ? group.key : null)
                              setDirectoryMenuReference(nextOpen ? event.currentTarget : null)
                            }}
                          >
                            <MoreHorizontal size={15} />
                          </button>
                          <Show when={directoryMenu() === group.key}>
                            <DirectoryMenuDropdown
                              directory={directory()}
                              reference={directoryMenuReference()}
                              onCreate={p.onCreate}
                              onClose={closeMenus}
                              owner={p.drawer ? "left-sidebar" : undefined}
                              placement="bottom-start"
                            />
                          </Show>
                        </div>
                        <button
                          class={iconButton}
                          title={directory() ? `在 ${group.label} 中新建任务` : "新建任务"}
                          aria-label="新建任务"
                          disabled={p.creating || !p.connected}
                          onClick={(event) => {
                            event.stopPropagation()
                            p.onCreate(directory())
                          }}
                        >
                          <Plus size={16} />
                        </button>
                        <button
                          class={iconButton}
                          title="文件管理"
                          aria-label="文件管理"
                          onClick={(event) => {
                            event.stopPropagation()
                            p.onOpenDirectoryFileTree?.(directory())
                          }}
                        >
                          <FolderOpen size={15} />
                        </button>
                      </Show>
                    </div>

                    <Show when={expand() && !isCollapsed()}>
                      {renderTree(buildSessionTree(group.ids, parentOf), 0, [])}
                    </Show>
                  </section>
                )
              }}
            </For>
            <Show when={p.sessions.length === 0}>
              <p class={`text-xs text-[var(--text-muted)] ${expand() ? "px-3 py-2" : "py-2 text-center"}`}>
                {expand()
                  ? p.archiveMode
                    ? "暂无归档任务"
                    : "暂无任务 · 点击「打开工作区」载入历史任务"
                  : "·"}
              </p>
            </Show>
          </div>
        </Show>
      </div>

      <ContextFooter active={p.active} expanded={expand()} onOpenSettings={p.onOpenSettings} />
    </aside>
  )
}
