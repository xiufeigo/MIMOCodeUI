// 信息栏：悬浮在主区右上角的信息卡片，四段可折叠。
//
//   环境信息  默认展开——变更 / 本地 / 分支 / 提交或推送 / 拉取请求状态
//   任务清单  默认折叠——todo_write 解析结果
//   产物      默认折叠——当前无数据源，空态
//   参考      默认折叠——当前无数据源，空态
//
// 宽度与外边距取自 lib/shell-layout.ts 的 INFO_PANEL_WIDTH / INFO_PANEL_GUTTER，
// 布局状态由父级（shell-layout）持有，本组件只负责渲染与自身的展开/收起。
//
// 定位：`absolute` + `right: INFO_PANEL_GUTTER`，挂在主区（position: relative 的
// 内容容器）内即可；不自行监听 resize，主区窄屏时由父级决定是否占位。

import { createResource, createSignal, onCleanup, onMount, Show, type Component } from "solid-js"
import { Info, ListTodo, Package, X, BookOpen } from "lucide-solid"
import { GIT_ENV_UNAVAILABLE, fetchGitEnv, type GitEnvState } from "../../lib/git-env"
import { INFO_PANEL_GUTTER, INFO_PANEL_WIDTH } from "../../lib/shell-layout"
import { useApp } from "../../lib/store/provider"
import { EnvironmentSection } from "./environment-section"
import { ArtifactSection, InfoSection, ReferenceSection, TodoSection } from "./sections"

export interface InfoPanelProps {
  /** 当前会话；为 null 时只展示与仓库无关的静态信息。 */
  sessionID: string | null
  open: boolean
  onClose: () => void
}

type SectionKey = "environment" | "todos" | "artifacts" | "references"

/** 默认展开态：只有「环境信息」展开，其余三段折叠。 */
const DEFAULT_SECTIONS: Record<SectionKey, boolean> = {
  environment: true,
  todos: false,
  artifacts: false,
  references: false,
}

export const InfoPanel: Component<InfoPanelProps> = (p) => {
  const { store } = useApp()
  const [sections, setSections] = createSignal<Record<SectionKey, boolean>>({ ...DEFAULT_SECTIONS })
  /** 分支下拉是否打开：Escape 时先关下拉，再关整块信息栏。 */
  const [overlayOpen, setOverlayOpen] = createSignal(false)

  const isOpen = (key: SectionKey) => sections()[key]
  const toggleSection = (key: SectionKey) =>
    setSections((previous) => ({ ...previous, [key]: !previous[key] }))

  const directory = () => (p.sessionID ? store.store.sessions[p.sessionID]?.directory ?? "" : "")

  // Git 环境：mimo serve 没有 Git 接口，fetchGitEnv 恒返回 unavailable，
  // 环境信息段据此渲染降级态。这里的结构是「真接入后就不用再改 UI」的预留。
  //
  // 适配层的入参目前没有 AbortSignal，故用「取消后丢弃结果」的方式避免面板
  // 关闭或切换会话后把过期结果写回界面。
  let gitAbort: AbortController | null = null
  onCleanup(() => gitAbort?.abort())

  const [gitState, { refetch: refetchGit }] = createResource(
    // 没有会话或面板关闭时用 null 短路：不发请求，环境信息段按降级态渲染。
    () => (p.open && p.sessionID ? directory() : null),
    async (dir): Promise<GitEnvState> => {
      gitAbort?.abort()
      const controller = new AbortController()
      gitAbort = controller
      const state = await fetchGitEnv(dir)
      return controller.signal.aborted ? GIT_ENV_UNAVAILABLE : state
    },
  )

  // Escape：先关浮层，再关信息栏（浮层的关闭由 PopoverSurface 兜底，这里做分层）。
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    if (overlayOpen()) return
    p.onClose()
  }
  onMount(() => window.addEventListener("keydown", onKeyDown))
  onCleanup(() => window.removeEventListener("keydown", onKeyDown))

  return (
    <Show when={p.open}>
      <aside
        id="info-panel"
        aria-label="信息栏"
        // top 必须让开主区顶栏（h-11 = 44px）+ 12px 间距，否则会盖住顶栏右侧的
        // 「信息栏 / 切换底部 / 切换侧边栏」三枚按钮。
        class="absolute top-[3.5rem] z-30 max-h-[calc(100%_-_5rem)] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-[0_8px_28px_rgba(0,0,0,0.10)]"
        style={{ width: `${INFO_PANEL_WIDTH}px`, right: `${INFO_PANEL_GUTTER}px` }}
      >
        {/* 标题栏 */}
        <div class="flex min-h-9 items-center gap-2 border-b border-[var(--border-color)] px-2">
          <Info size={14} class="shrink-0 text-[var(--text-muted)]" />
          <span class="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">信息</span>
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            title="关闭信息栏"
            aria-label="关闭信息栏"
            onClick={() => p.onClose()}
          >
            <X size={14} />
          </button>
        </div>

        {/* 四段；内容超出时整卡滚动，保证小屏上标题栏与关闭键始终可达。 */}
        <div class="min-h-0 overflow-y-auto">
          <InfoSection
            id="environment"
            icon={<Info size={13} />}
            title="环境信息"
            open={isOpen("environment")}
            onToggle={() => toggleSection("environment")}
          >
            <EnvironmentSection
              sessionID={p.sessionID}
              gitState={gitState()}
              gitLoading={gitState.loading}
              onRefreshGit={() => void refetchGit()}
              onOverlayOpenChange={setOverlayOpen}
            />
          </InfoSection>

          <InfoSection
            id="todos"
            icon={<ListTodo size={13} />}
            title="任务清单"
            open={isOpen("todos")}
            onToggle={() => toggleSection("todos")}
          >
            <TodoSection sessionID={p.sessionID} />
          </InfoSection>

          <InfoSection
            id="artifacts"
            icon={<Package size={13} />}
            title="产物"
            open={isOpen("artifacts")}
            onToggle={() => toggleSection("artifacts")}
          >
            <ArtifactSection />
          </InfoSection>

          <InfoSection
            id="references"
            icon={<BookOpen size={13} />}
            title="参考"
            open={isOpen("references")}
            onToggle={() => toggleSection("references")}
          >
            <ReferenceSection />
          </InfoSection>
        </div>
      </aside>
    </Show>
  )
}
