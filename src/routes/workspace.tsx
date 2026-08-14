import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { MessageSquare, MoreHorizontal, PanelRightOpen, MessagesSquare } from "lucide-solid"
import { useApp, useClient } from "../lib/store/provider"
import { createSessionAndPrompt } from "../lib/new-task"
import { resolveSessionSelection } from "../lib/session-selection"
import { validateDirectory } from "../lib/directory-access"
import { rememberDirectory } from "../lib/directory-history"
import { useSettings } from "../lib/settings/store"
import { useSessionPreferences } from "../lib/session-preferences"
import { useSessionArchive } from "../lib/session-archive"
import { playSound } from "../lib/sounds"
import { UnconnectedView } from "./connect"
import { SettingsDialog } from "../components/settings/settings-dialog"
import { LeftNav } from "../components/sidebar/left-nav"
import { WorkspaceLoadDialog } from "../components/sidebar/workspace-load-dialog"
import { MessageList } from "../components/message/message-list"
import { PromptInput } from "../components/prompt/prompt-input"
import { PermissionPrompt } from "../components/dialog/permission-prompt"
import { QuestionPrompt } from "../components/dialog/question-prompt"
import { RightPanel } from "../components/right-panel/panel"
import { SkillMarket } from "../components/skills/skill-market"
import { SessionInfoTooltip } from "../components/session-info-tooltip"
import { MoreMenuDropdown } from "../components/more-menu-dropdown"
import { FloatingChatPanel } from "../components/floating-chat-panel"
import { SidebarResizeHandle } from "../components/layout/sidebar-resize-handle"
import { CustomTitlebar } from "../components/titlebar/custom-titlebar"
import { TaskSearchDialog } from "../components/task-search-dialog"
import { RenameSessionDialog } from "../components/rename-session-dialog"
import { NewTaskWelcome } from "./new-task-welcome"
import type { AgentInfo, GlobalConfig, ProviderInfo, SessionInfo } from "../lib/protocol/types"
import { reasoningEffortOptions, type ReasoningEffort, type ReasoningEffortOption } from "../components/prompt/types"
import {
  clampLeftSidebarWidth,
  clampRightSidebarWidth,
  LEFT_SIDEBAR_MAX,
  LEFT_SIDEBAR_MIN,
  RIGHT_SIDEBAR_MAX,
  RIGHT_SIDEBAR_MIN,
  workspaceLayoutMode,
  type WorkspaceLayoutMode,
} from "../lib/layout"

type RightPanelMode = "closed" | "split" | "expanded" | "expanded-floating"

export interface WorkspacePageProps {
  activeSession: string | null
  onOpenSession: (id: string | null) => void
}

/** Trae 风格三栏工作台：左侧任务 | 中间对话 | 右侧上下文面板。 */
export function WorkspacePage(props: WorkspacePageProps) {
  const { store, disconnect, connection, activeProfile, setActiveProfile } = useApp()
  const { isModelVisible, settings, setLayoutWidth } = useSettings()
  const { displayTitle, rename, sortSessionIDs } = useSessionPreferences()
  const { isArchived } = useSessionArchive()
  const client = useClient()
  const [pendingSession, setPendingSession] = createSignal(false)
  const [agents, setAgents] = createSignal<AgentInfo[]>([])
  const [providers, setProviders] = createSignal<ProviderInfo[]>([])
  const [globalConfig, setGlobalConfig] = createSignal<GlobalConfig | null>(null)
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [hydrated, setHydrated] = createSignal(false)
  const [navExpanded, setNavExpanded] = createSignal(true)
  const [navSel, setNavSel] = createSignal<"tasks" | "plugins">("tasks")
  const [archiveMode, setArchiveMode] = createSignal(false)
  const [fileTreeRoot, setFileTreeRoot] = createSignal<string | null>(null)
  const [infoTipOpen, setInfoTipOpen] = createSignal(false)
  const [moreOpen, setMoreOpen] = createSignal(false)
  const [moreReference, setMoreReference] = createSignal<HTMLElement | null>(null)
  const [rightPanelMode, setRightPanelMode] = createSignal<RightPanelMode>("split")
  const [taskSearchOpen, setTaskSearchOpen] = createSignal(false)
  const [renameSessionID, setRenameSessionID] = createSignal<string | null>(null)
  const [newTaskDirectory, setNewTaskDirectory] = createSignal<string | undefined>()
  const [workspaceWidth, setWorkspaceWidth] = createSignal(0)
  const [leftSidebarWidth, setLeftSidebarWidth] = createSignal(clampLeftSidebarWidth(settings().layout.leftSidebarWidth))
  const [rightSidebarWidth, setRightSidebarWidth] = createSignal(clampRightSidebarWidth(settings().layout.rightSidebarWidth))
  const [temporaryLeftDrawer, setTemporaryLeftDrawer] = createSignal(false)
  const [temporaryRightDrawer, setTemporaryRightDrawer] = createSignal(false)
  const [rightPanelElement, setRightPanelElement] = createSignal<HTMLElement | null>(null)
  let workspaceEl: HTMLDivElement | undefined
  let leftDrawerEl: HTMLElement | undefined
  let navigationButtonEl: HTMLButtonElement | undefined
  let rightNavButtonEl: HTMLButtonElement | undefined

  const isTauriEnv = () =>
    typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined"

  const canWriteFiles = () => isTauriEnv() && activeProfile().mode === "local"
  const rightOpen = () => rightPanelMode() !== "closed"
  const rightExpanded = () => rightPanelMode() === "expanded" || rightPanelMode() === "expanded-floating"
  const chatFloating = () => rightPanelMode() === "expanded-floating"
  const layoutMode = createMemo<WorkspaceLayoutMode>(() =>
    workspaceLayoutMode(workspaceWidth(), leftSidebarWidth(), rightSidebarWidth(), rightOpen() && !rightExpanded()),
  )
  const leftInline = () => layoutMode() === "wide"
  const effectiveLeftExpanded = () => temporaryLeftDrawer() || navExpanded()
  const rightInline = () => rightOpen() && !rightExpanded() && layoutMode() !== "compact"
  const leftVisible = () => leftInline() || temporaryLeftDrawer()
  const rightVisible = () => rightInline() || rightExpanded() || temporaryRightDrawer()

  createEffect(() => {
    setLeftSidebarWidth(clampLeftSidebarWidth(settings().layout.leftSidebarWidth))
    setRightSidebarWidth(clampRightSidebarWidth(settings().layout.rightSidebarWidth))
  })

  function closeTemporaryDrawer(options?: { restoreFocus?: boolean }) {
    if (!temporaryLeftDrawer() && !temporaryRightDrawer()) return
    const wasLeft = temporaryLeftDrawer()
    setTemporaryLeftDrawer(false)
    setTemporaryRightDrawer(false)
    if (options?.restoreFocus) {
      queueMicrotask(() => {
        if (wasLeft) navigationButtonEl?.focus()
        else rightNavButtonEl?.focus()
      })
    }
  }

  /** 紧凑布局统一开关临时抽屉：打开一侧必然关闭另一侧及展开的右栏。 */
  function openTemporaryDrawer(side: "left" | "right" | null) {
    if (side && rightExpanded()) setRightPanelMode("split")
    setTemporaryLeftDrawer(side === "left")
    setTemporaryRightDrawer(side === "right")
  }

  function drawerOwnsTarget(target: EventTarget | null, side: "left" | "right") {
    if (!(target instanceof Node)) return false
    if (side === "left") {
      return (
        leftDrawerEl?.contains(target) ||
        (target instanceof Element && target.closest('[data-overlay-owner="left-sidebar"]') !== null)
      )
    }
    return rightPanelElement()?.contains(target)
  }

  function navigationToggleOwnsTarget(target: EventTarget | null) {
    return target instanceof Node && navigationButtonEl?.contains(target)
  }

  createEffect(() => {
    if (layoutMode() === "wide") closeTemporaryDrawer()
  })

  createEffect(() => {
    const side: "left" | "right" | null = temporaryLeftDrawer() ? "left" : temporaryRightDrawer() ? "right" : null
    if (!side) return
    const drawerEl = side === "left" ? leftDrawerEl : rightPanelElement() ?? undefined

    queueMicrotask(() => drawerEl?.querySelector<HTMLElement>("button:not([disabled]), input, select, textarea")?.focus())

    const ownsTarget = (target: EventTarget | null) =>
      drawerOwnsTarget(target, side) || navigationToggleOwnsTarget(target)

    const closeOutsidePointer = (event: PointerEvent) => {
      if (ownsTarget(event.target)) return
      closeTemporaryDrawer()
    }
    const closeOutsideFocus = (event: FocusEvent) => {
      if (ownsTarget(event.target)) return
      closeTemporaryDrawer()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      if (document.querySelector('[data-overlay-owner="left-sidebar"]')) return
      event.preventDefault()
      closeTemporaryDrawer({ restoreFocus: true })
    }

    window.addEventListener("pointerdown", closeOutsidePointer, true)
    window.addEventListener("focusin", closeOutsideFocus, true)
    window.addEventListener("keydown", closeOnEscape)
    onCleanup(() => {
      window.removeEventListener("pointerdown", closeOutsidePointer, true)
      window.removeEventListener("focusin", closeOutsideFocus, true)
      window.removeEventListener("keydown", closeOnEscape)
    })
  })

  onMount(() => {
    if (!workspaceEl) return
    const observer = new ResizeObserver(([entry]) => setWorkspaceWidth(entry.contentRect.width))
    observer.observe(workspaceEl)
    setWorkspaceWidth(workspaceEl.clientWidth)
    onCleanup(() => observer.disconnect())
  })

  /** 统一打开会话：切回任务页、关闭文件树与临时抽屉。 */
  function openSession(id: string | null) {
    props.onOpenSession(id)
    setNavSel("tasks")
    setFileTreeRoot(null)
    setNewTaskDirectory(undefined)
    closeTemporaryDrawer()
  }

  /** 统一进入新建任务页：不创建空会话，可选预填目录。 */
  function openNewTask(directory?: string) {
    setNavSel("tasks")
    setFileTreeRoot(null)
    setNewTaskDirectory(directory)
    setArchiveMode(false)
    props.onOpenSession(null)
    closeTemporaryDrawer()
  }

  /** 统一进入插件市场：关闭互斥的右栏和临时抽屉。 */
  function openPlugins() {
    setNavSel("plugins")
    setFileTreeRoot(null)
    setArchiveMode(false)
    setRightPanelMode("closed")
    closeTemporaryDrawer()
  }

  /** 统一打开文件管理：保持会话上下文并切换到任务页。 */
  function openFileManager(sessionID: string) {
    if (!settings().advanced.showFileTree) return
    props.onOpenSession(sessionID)
    setNavSel("tasks")
    setFileTreeRoot(store.store.sessions[sessionID]?.directory ?? "")
    setArchiveMode(false)
    setRightPanelMode("split")
    setNewTaskDirectory(undefined)
    closeTemporaryDrawer()
  }

  /** 目录分组行打开文件管理：不切换会话，直接按目录展示工作区根。 */
  function openDirectoryFileTree(directory: string | undefined) {
    if (!settings().advanced.showFileTree) return
    setNavSel("tasks")
    setFileTreeRoot(directory ?? "")
    setArchiveMode(false)
    setNewTaskDirectory(undefined)
    closeTemporaryDrawer()
  }

  function handleSelectNav(id: string) {
    if (id === "plugins") openPlugins()
    else openNewTask()
  }

  function toggleNavigation() {
    if (layoutMode() !== "wide") {
      openTemporaryDrawer(!temporaryLeftDrawer() ? "left" : null)
      return
    }
    setNavExpanded((expanded) => !expanded)
  }

  function closeRightPanel() {
    if (temporaryRightDrawer()) {
      openTemporaryDrawer(null)
      return
    }
    setRightPanelMode("closed")
  }

  function openRightPanel() {
    if (layoutMode() === "compact") {
      openTemporaryDrawer("right")
      return
    }
    setRightPanelMode("split")
  }

  function toggleRightExpanded() {
    setRightPanelMode((mode) => (mode === "expanded" || mode === "expanded-floating" ? "split" : "expanded"))
  }

  function toggleFloatingChat() {
    setRightPanelMode((mode) => (mode === "expanded-floating" ? "expanded" : "expanded-floating"))
  }

  /** 中栏按钮：紧凑布局打开右侧抽屉；普通分栏时先扩展右栏，再悬浮完整聊天窗。 */
  function toggleRightAction() {
    if (layoutMode() === "compact" && !rightExpanded()) {
      openTemporaryDrawer(!temporaryRightDrawer() ? "right" : null)
      return
    }
    if (rightPanelMode() === "closed") openRightPanel()
    else if (rightPanelMode() === "split") setRightPanelMode("expanded-floating")
  }

  // Hydrate agents/providers once the connection becomes available.
  // 注意：历史会话默认不全部载入——由「打开工作区」按目录按需载入，
  // 新会话则通过 SSE session.created 事件增量进入任务列表。
  createEffect(async () => {
    if (hydrated() || connection().status !== "connected") return
    const c = client()
    if (!c) return
    setHydrated(true)
    try {
      const agentList = await c.agents()
      setAgents(agentList)
      store.setStore("agents", agentList.map((agent) => ({ name: agent.name })))
      const providerResult = await c.providers()
      setProviders(providerResult.providers ?? [])
      store.setStore("providers", providerResult.providers ?? [])
      setGlobalConfig(await c.getGlobalConfig().catch(() => null))
    } catch (error) {
      console.error("hydrate failed", error)
    }
  })

  createEffect(() => {
    if (connection().status !== "connected") setHydrated(false)
  })

  // ---- 工作区：按目录按需载入历史任务（默认不全部载入） ----
  const [workspaceDir, setWorkspaceDir] = createSignal<string | null>(null)
  const [workspaceLoad, setWorkspaceLoad] = createSignal<{ directory: string; sessions: SessionInfo[] } | null>(null)
  const [workspaceLoadStage, setWorkspaceLoadStage] = createSignal<"prompt" | "select">("prompt")
  const [workspaceSelected, setWorkspaceSelected] = createSignal<Set<string>>(new Set())

  /** 打开工作区：选择目录后拉取历史会话，命中则弹「全部载入 / 只载入指定」。 */
  async function openWorkspace(directory: string | undefined) {
    if (!directory) {
      setWorkspaceDir(null)
      return
    }
    const c = client()
    if (!c || connection().status !== "connected") return
    setWorkspaceDir(directory)
    try {
      const all = await c.listSessions()
      const matches = all.filter((session) => isUnderDirectory(session.directory, directory))
      if (matches.length === 0) return
      setWorkspaceLoad({ directory, sessions: matches })
      setWorkspaceLoadStage("prompt")
      setWorkspaceSelected(new Set<string>())
    } catch (error) {
      console.error("load workspace sessions failed", error)
    }
  }

  /** 把选中的历史会话注入任务列表（SSE 同款路径，天然去重）。 */
  function ingestWorkspaceSessions(sessions: SessionInfo[]) {
    for (const session of sessions) {
      store.handleEvent({ payload: { type: "session.created", properties: { session } } })
    }
    setWorkspaceLoad(null)
  }

  createEffect(() => {
    activeProfile().id
    props.onOpenSession(null)
    setFileTreeRoot(null)
    setAgents([])
    setProviders([])
    setGlobalConfig(null)
    setPendingAgent({})
    setPendingModel({})
    setPendingReasoningEffort({})
    setWorkspaceDir(null)
    setWorkspaceLoad(null)
    setWorkspaceSelected(new Set<string>())
    setHydrated(false)
  })

  const sessionOrder = createMemo(() => store.store.sessionOrder)
  const orderedSessionIDs = createMemo(() => sortSessionIDs(sessionOrder()))
  /** 未归档会话列表（按归档状态过滤后传给左栏任务列表）。 */
  const visibleSessionIDs = createMemo(() =>
    orderedSessionIDs().filter((id) => !isArchived(id, store.store.sessions[id]?.directory)),
  )
  /** 已归档会话列表（供归档任务列表展示）。 */
  const archivedSessionIDs = createMemo(() =>
    orderedSessionIDs().filter((id) => isArchived(id, store.store.sessions[id]?.directory)),
  )
  /** 左栏当前展示的会话列表（归档模式下显示归档任务）。 */
  const leftSessionIDs = createMemo(() => (archiveMode() ? archivedSessionIDs() : visibleSessionIDs()))
  const selectableAgents = createMemo(() => agents().filter((agent) => agent.hidden !== true && agent.mode !== "subagent"))
  const modelOptions = createMemo(() => {
    const output: { providerID: string; modelID: string; providerName: string; label: string }[] = []
    for (const provider of providers()) {
      for (const model of Object.values(provider.models ?? {})) {
        const key = `${model.providerID ?? provider.id}/${model.id}`
        if (!isModelVisible(key)) continue
        output.push({
          providerID: model.providerID ?? provider.id,
          modelID: model.id,
          providerName: provider.name ?? provider.id,
          label: model.name ?? model.id,
        })
      }
    }
    return output
  })

  async function createNewTask(request: { text: string; directory?: string; profileID: string; agent?: string; model?: string; variant?: string; parts?: import("../lib/attachment").PromptPart[] }) {
    if (pendingSession()) return
    setPendingSession(true)
    try {
      const profile = request.profileID === activeProfile().id ? activeProfile() : undefined
      if (!profile) await setActiveProfile(request.profileID)
      const selectedProfile = activeProfile()
      const directory = await validateDirectory(selectedProfile, request.directory ?? "")
      const c = client()
      if (!c) throw new Error("服务器未连接")
      const created = await createSessionAndPrompt(
        c,
        { ...request, directory },
        (session) => store.handleEvent({ payload: { type: "session.created", properties: { session } } }),
      )
      if (directory) rememberDirectory(selectedProfile.id, directory)
      openSession(created.id)
      setRightPanelMode("split")
    } finally {
      setPendingSession(false)
    }
  }
  function runCommand(command: string) {
    switch (command) {
      case "settings.open":
        setSettingsOpen(true)
        break
      case "session.new":
        openNewTask()
        break
      case "tab.chat":
        closeRightPanel()
        break
      case "tab.files":
      case "tab.terminal":
        openRightPanel()
        break
      case "prompt.focus":
        document.querySelector<HTMLTextAreaElement>("textarea")?.focus()
        break
      case "connection.disconnect":
        disconnect()
        break
      default:
        break
    }
  }

  createEffect(() => {
    const binds = settings().keybinds
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const target = event.target as HTMLElement
      const inField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      const combo = buildCombo(event)
      for (const [command, bind] of Object.entries(binds)) {
        if (!bind) continue
        if (bind === combo && (!inField || event.key === "Escape")) {
          event.preventDefault()
          runCommand(command)
          return
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  })

  createEffect(async () => {
    const sessionID = props.activeSession
    const c = client()
    if (!sessionID || !c) return
    try {
      store.hydrateMessages(sessionID, await c.messages(sessionID))
    } catch (error) {
      console.error("load messages failed", error)
    }
  })

  // 自动接受权限：开启后对每个待处理请求自动「始终允许」。
  createEffect(() => {
    if (!settings().permissions.autoAccept) return
    const c = client()
    if (!c || connection().status !== "connected") return
    for (const requests of Object.values(store.store.permissions)) {
      for (const req of requests) {
        void c.replyPermission(req.id, "always").catch(() => {})
      }
    }
  })

  // 提示音：权限请求到达 / 连接错误 / 会话完成（仅在状态跳变时触发一次）。
  let lastBusy = false
  let lastError = false
  let lastPending = false
  createEffect(() => {
    const s = settings()
    const conn = connection()
    const pending = Object.values(store.store.permissions).some((list) => list.length > 0)
    if (pending && !lastPending) playSound(s.sounds.permissions)
    lastPending = pending
    const errored = conn.status === "error"
    if (errored && !lastError) playSound(s.sounds.errors)
    lastError = errored
    const busy = activeStatus()?.type === "busy"
    if (lastBusy && !busy) playSound(s.sounds.agent)
    lastBusy = busy
  })

  const activeMessages = createMemo(() => (props.activeSession ? store.sessionMessages(props.activeSession) : []))
  const activeStatus = createMemo(() => (props.activeSession ? store.store.status[props.activeSession] : undefined))
  const activeTitle = createMemo(() =>
    props.activeSession ? displayTitle(props.activeSession, store.store.sessions[props.activeSession]?.title) : undefined,
  )
  const activeCreated = createMemo(() =>
    props.activeSession ? store.store.sessions[props.activeSession]?.time?.created : undefined,
  )
  /** 当前会话的父会话 id（子 agent 会话只读时用于「返回主会话」）。 */
  const activeParentID = createMemo(() =>
    props.activeSession ? store.store.sessions[props.activeSession]?.parentID ?? null : null,
  )

  function handleSessionDeleted(id: string) {
    if (props.activeSession === id) openSession(null)
  }

  const connected = () => connection().status === "connected"

  /** 手动选择按会话隔离（new-task 作为独立键），避免切换会话互相污染。 */
  const [pendingAgent, setPendingAgent] = createSignal<Record<string, string | null>>({})
  const [pendingModel, setPendingModel] = createSignal<Record<string, string | null>>({})
  const [pendingReasoningEffort, setPendingReasoningEffort] = createSignal<Record<string, string>>({})
  const onAgentChange = (agent: string | undefined) =>
    setPendingAgent((previous) => ({ ...previous, [props.activeSession ?? "new-task"]: agent ?? null }))
  const onModelChange = (model: string | undefined) =>
    setPendingModel((previous) => ({ ...previous, [props.activeSession ?? "new-task"]: model ?? null }))
  const onReasoningEffortChange = (effort: string) =>
    setPendingReasoningEffort((previous) => ({ ...previous, [props.activeSession ?? "new-task"]: effort }))

  /** 当前会话解析出的实际 Agent/模型（来自消息历史或服务端默认）。 */
  const activeSelection = createMemo<{ agent?: string; model?: string }>(() => {
    if (!props.activeSession) return {}
    return resolveSessionSelection({
      messages: activeMessages(),
      agents: selectableAgents(),
      models: modelOptions(),
      globalConfig: globalConfig(),
    })
  })

  /** 新建任务时的服务端默认 Agent/模型（无会话，仅用服务端配置）。 */
  const newTaskSelection = createMemo<{ agent?: string; model?: string }>(() =>
    resolveSessionSelection({
      messages: [],
      agents: selectableAgents(),
      models: modelOptions(),
      globalConfig: globalConfig(),
    }),
  )

  /** 显示值：手动选择优先，其次会话历史/服务端默认。 */
  const activeAgent = () => {
    const pending = pendingAgent()[props.activeSession ?? "new-task"]
    if (pending) return pending
    return props.activeSession ? activeSelection().agent : newTaskSelection().agent
  }
  const activeModel = () => {
    const pending = pendingModel()[props.activeSession ?? "new-task"]
    if (pending) return pending
    return props.activeSession ? activeSelection().model : newTaskSelection().model
  }
  /** 当前模型信息（providerID/modelID → ModelInfo，用于读取 variants）。 */
  const activeModelInfo = createMemo(() => {
    const key = activeModel()
    if (!key) return undefined
    const slash = key.indexOf("/")
    if (slash <= 0) return undefined
    const providerID = key.slice(0, slash)
    const modelID = key.slice(slash + 1)
    return providers().find((p) => p.id === providerID)?.models?.[modelID]
  })

  /** 当前模型的思考强度选项（真实 variants；缺失时回退五档）。 */
  const activeEffortOptions = createMemo<ReasoningEffortOption[]>(() =>
    reasoningEffortOptions(activeModelInfo()?.variants),
  )

  const activeReasoningEffort = (): ReasoningEffort => {
    const pending = pendingReasoningEffort()[props.activeSession ?? "new-task"]
    if (pending && activeEffortOptions().some((o) => o.value === pending)) return pending
    return "default"
  }

  return (
    <div class="flex h-full flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
      <CustomTitlebar
        showNavigation={settings().advanced.showNavigation}
        showSearch={settings().advanced.showSearch}
        navExpanded={leftVisible() && effectiveLeftExpanded()}
        navButtonRef={(element) => (navigationButtonEl = element)}
        onToggleNav={toggleNavigation}
        onSearchClick={() => {
          closeTemporaryDrawer()
          setTaskSearchOpen((open) => !open)
        }}
        searchActive={taskSearchOpen()}
        onOpenSettings={() => {
          closeTemporaryDrawer()
          setSettingsOpen(true)
        }}
      />

      <div ref={workspaceEl} class="relative flex min-h-0 flex-1 overflow-hidden">
        <Show when={leftVisible()}>
          <aside
            ref={leftDrawerEl}
            class={`z-20 flex h-full min-h-0 shrink-0 flex-col bg-[var(--bg-app)] ${
              temporaryLeftDrawer() ? "absolute inset-y-0 left-0 shadow-2xl" : ""
            }`}
            style={{ width: `${effectiveLeftExpanded() ? leftSidebarWidth() : 64}px` }}
          >
            <LeftNav
              sessions={leftSessionIDs()}
              active={props.activeSession}
              onOpen={openSession}
              onCreate={openNewTask}
              creating={pendingSession()}
              connected={connected()}
              onDeleted={handleSessionDeleted}
              onRename={setRenameSessionID}
              width={leftSidebarWidth()}
              drawer={temporaryLeftDrawer()}
              expanded={effectiveLeftExpanded()}
              onToggleExpanded={() => setNavExpanded(!navExpanded())}
              navSel={navSel()}
              onSelectNav={handleSelectNav}
              onOpenFileTree={openFileManager}
              onOpenDirectoryFileTree={openDirectoryFileTree}
              onOpenSettings={() => {
                closeTemporaryDrawer()
                setSettingsOpen(true)
              }}
              fileTreeRoot={fileTreeRoot()}
              onCloseFileTree={() => setFileTreeRoot(null)}
              canWriteFiles={canWriteFiles()}
              archiveMode={archiveMode()}
              onToggleArchiveMode={() => setArchiveMode((v) => !v)}
              workspaceDirectory={workspaceDir()}
              onOpenWorkspace={(dir) => void openWorkspace(dir)}
            />
          </aside>
          <Show when={leftInline() && navExpanded()}>
            <SidebarResizeHandle
              side="left"
              value={leftSidebarWidth()}
              min={LEFT_SIDEBAR_MIN}
              max={LEFT_SIDEBAR_MAX}
              onPreview={setLeftSidebarWidth}
              onCommit={(value) => setLayoutWidth("left", value)}
            />
          </Show>
          <Show when={temporaryLeftDrawer()}>
            <button
              class="absolute inset-0 z-10 bg-black/35"
              aria-label="关闭任务栏"
              onClick={() => closeTemporaryDrawer()}
            />
          </Show>
        </Show>

        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <Show
            when={connected()}
            fallback={
              <UnconnectedView
                onOpenSettings={() => {
                  closeTemporaryDrawer()
                  setSettingsOpen(true)
                }}
              />
            }
          >
            <Show when={navSel() === "plugins"}>
              <SkillMarket />
            </Show>

            <Show when={navSel() === "tasks"}>
              <Show
                when={props.activeSession}
                fallback={
                  <NewTaskWelcome
                    agents={selectableAgents()}
                    models={modelOptions()}
                    agent={activeAgent()}
                    model={activeModel()}
                    reasoningEffort={activeReasoningEffort()}
                    effortOptions={activeEffortOptions()}
                    initialDirectory={newTaskDirectory()}
                    pending={pendingSession()}
                    onAgentChange={onAgentChange}
                    onModelChange={onModelChange}
                    onReasoningEffortChange={onReasoningEffortChange}
                    onSubmit={createNewTask}
                  />
              }
              >
                <div class="relative flex min-h-0 flex-1 gap-2 p-2">
                  <Show when={!rightExpanded()}>
                    <div class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)]">
                      <div class="relative flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-color)] px-3">
                        <button
                          class="relative rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                          title="会话信息"
                          onMouseEnter={() => setInfoTipOpen(true)}
                          onMouseLeave={() => setInfoTipOpen(false)}
                        >
                          <MessageSquare size={16} />
                          <SessionInfoTooltip sessionID={props.activeSession} visible={infoTipOpen()} />
                        </button>
                        <Show when={activeTitle()}>
                          <span class="max-w-64 truncate text-sm font-medium text-[var(--text-primary)]">{activeTitle()}</span>
                          <Show when={activeCreated()}>
                            <span class="hidden text-xs text-[var(--text-muted)] md:inline">{formatTime(activeCreated()!)}</span>
                          </Show>
                        </Show>

                        <div>
                          <button
                            class="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                            title="更多操作"
                            aria-expanded={moreOpen()}
                            onClick={(event) => {
                              const open = !moreOpen()
                              setMoreOpen(open)
                              setMoreReference(open ? event.currentTarget : null)
                            }}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          <Show when={moreOpen()}>
                            <MoreMenuDropdown
                              sessionID={props.activeSession!}
                              reference={moreReference()}
                              onOpenFileTree={(id) => openFileManager(id)}
                              onDeleted={handleSessionDeleted}
                              onRename={setRenameSessionID}
                              onClose={() => {
                                setMoreOpen(false)
                                setMoreReference(null)
                              }}
                            />
                          </Show>
                        </div>

                        <div class="ml-auto flex items-center gap-2">
                          <Show when={activeStatus() && settings().advanced.showStatus}>
                            <span
                              class={`rounded px-2 py-0.5 text-xs ${
                                activeStatus()?.type === "busy"
                                  ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                                  : "bg-[var(--bg-raised)] text-[var(--text-muted)]"
                              }`}
                            >
                              {activeStatus()?.type === "busy"
                                ? "运行中"
                                : activeStatus()?.type === "retry"
                                  ? "需重试"
                                  : "空闲"}
                            </span>
                          </Show>
                          <button
                            class="rounded border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--error)] hover:text-[var(--error)]"
                            onClick={disconnect}
                            title="断开连接"
                          >
                            断开
                          </button>
                          <button
                            ref={rightNavButtonEl}
                            class="flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                            onClick={toggleRightAction}
                            title={rightOpen() ? "悬浮对话面板" : "展开右侧栏"}
                            aria-label={rightOpen() ? "悬浮对话面板" : "展开右侧栏"}
                          >
                            <Show when={rightOpen()} fallback={<PanelRightOpen size={15} />}>
                              <MessagesSquare size={15} />
                            </Show>
                          </button>
                        </div>
                      </div>

                      <MessageList sessionID={props.activeSession!} messages={activeMessages()} />
                      <PermissionPrompt sessionID={props.activeSession!} />
                      <QuestionPrompt sessionID={props.activeSession!} />
                      <PromptInput
                        sessionID={props.activeSession!}
                        agent={activeAgent()}
                        model={activeModel()}
                        reasoningEffort={activeReasoningEffort()}
                    effortOptions={activeEffortOptions()}
                        agents={selectableAgents()}
                        models={modelOptions()}
                        onAgentChange={onAgentChange}
                        onModelChange={onModelChange}
                        onReasoningEffortChange={onReasoningEffortChange}
                        parentSessionID={activeParentID()}
                        onReturnToParent={() => {
                          const parent = activeParentID()
                          if (parent) openSession(parent)
                        }}
                      />
                    </div>
                  </Show>

                  <Show when={rightInline() && !rightExpanded()}>
                    <SidebarResizeHandle
                      side="right"
                      value={rightSidebarWidth()}
                      min={RIGHT_SIDEBAR_MIN}
                      max={RIGHT_SIDEBAR_MAX}
                      onPreview={setRightSidebarWidth}
                      onCommit={(value) => setLayoutWidth("right", value)}
                    />
                  </Show>
                  <Show when={temporaryRightDrawer()}>
                    <button
                      class="absolute inset-0 z-20 bg-black/35"
                      aria-label="关闭右侧栏"
                      onClick={() => openTemporaryDrawer(null)}
                    />
                  </Show>
                  <RightPanel
                    open={rightVisible()}
                    drawer={temporaryRightDrawer()}
                    width={rightSidebarWidth()}
                    expanded={rightExpanded()}
                    chatFloating={chatFloating()}
                    onClose={closeRightPanel}
                    onToggleExpanded={toggleRightExpanded}
                    onToggleFloatingChat={toggleFloatingChat}
                    sessionID={props.activeSession!}
                    onPanelElement={setRightPanelElement}
                  />

                  <FloatingChatPanel
                    boundsElement={rightPanelElement()}
                    open={chatFloating()}
                    sessionID={props.activeSession!}
                    onPinToPanel={() => setRightPanelMode("split")}
                    agent={activeAgent()}
                    model={activeModel()}
                    reasoningEffort={activeReasoningEffort()}
                    effortOptions={activeEffortOptions()}
                    agents={selectableAgents()}
                    models={modelOptions()}
                    onAgentChange={onAgentChange}
                    onModelChange={onModelChange}
                    onReasoningEffortChange={onReasoningEffortChange}
                    parentSessionID={activeParentID()}
                    onReturnToParent={() => {
                      const parent = activeParentID()
                      if (parent) openSession(parent)
                    }}
                  />
                </div>
              </Show>
            </Show>
          </Show>
        </div>
      </div>

      <TaskSearchDialog
        open={taskSearchOpen()}
        sessionIDs={orderedSessionIDs()}
        onOpenSession={(id) => {
          openSession(id)
          setTaskSearchOpen(false)
        }}
        onClose={() => setTaskSearchOpen(false)}
      />
      <RenameSessionDialog
        open={renameSessionID() !== null}
        title={renameSessionID() ? displayTitle(renameSessionID()!, store.store.sessions[renameSessionID()!]?.title) : ""}
        onConfirm={(title) => {
          const id = renameSessionID()
          if (id) rename(id, title)
        }}
        onClose={() => setRenameSessionID(null)}
      />
      <SettingsDialog open={settingsOpen()} onClose={() => setSettingsOpen(false)} />
      <WorkspaceLoadDialog
        open={workspaceLoad() !== null}
        directory={workspaceLoad()?.directory ?? ""}
        sessions={workspaceLoad()?.sessions ?? []}
        stage={workspaceLoadStage()}
        selected={workspaceSelected()}
        onStageChange={setWorkspaceLoadStage}
        onSelectedChange={setWorkspaceSelected}
        onLoadAll={() => {
          const pending = workspaceLoad()
          if (pending) ingestWorkspaceSessions(pending.sessions)
        }}
        onLoadSelected={() => {
          const pending = workspaceLoad()
          if (!pending) return
          ingestWorkspaceSessions(pending.sessions.filter((s) => workspaceSelected().has(s.id)))
        }}
        onClose={() => setWorkspaceLoad(null)}
      />
    </div>
  )
}

function formatTime(ms: number): string {
  const date = new Date(ms)
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

/** Normalize a keydown event to a "Ctrl+K" style combo string. */
function buildCombo(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.ctrlKey) parts.push("Ctrl")
  if (event.altKey) parts.push("Alt")
  if (event.shiftKey) parts.push("Shift")
  if (event.metaKey) parts.push("Meta")
  const key = event.key === " " ? "Space" : event.key
  if (!["Control", "Alt", "Shift", "Meta"].includes(key)) parts.push(key)
  return parts.join("+")
}

/** 会话目录是否位于工作区目录之下（含相等；大小写不敏感，兼容 / 与 \）。 */
function isUnderDirectory(sessionDir: string | undefined, workspaceDir: string): boolean {
  if (!sessionDir) return false
  const a = sessionDir.replace(/[\\/]+$/, "").toLowerCase()
  const b = workspaceDir.replace(/[\\/]+$/, "").toLowerCase()
  if (a === b) return true
  return a.startsWith(b + "/") || a.startsWith(b + "\\")
}
