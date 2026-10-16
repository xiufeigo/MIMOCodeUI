// 信息栏「环境信息」段。
//
// ⚠️ 数据可信度：Git 相关四项（分支 / 提交 / 推送 / 拉取请求）在 `mimo serve`
// 上**没有任何接口**，git-env.ts 的适配层一律返回 availability: "unavailable"。
// 因此这里如实渲染降级态：灰掉的原因文案、不可点的分支行、点了只提示「未接入」。
// 绝不用占位分支名/提交记录/PR 数据填充界面——伪造比留白更糟。
// 服务端补齐接口后，只需在 git-env.ts 注册 provider，本段无需改动。

import { createMemo, createResource, createSignal, For, onCleanup, Show, type Component, type JSX } from "solid-js"
import {
  CloudUpload,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  HardDrive,
  Info,
  LoaderCircle,
} from "lucide-solid"
import {
  GIT_ENV_UNAVAILABLE,
  GIT_UNAVAILABLE_REASON,
  commitChanges,
  displayBranch,
  fetchPullRequestStatus,
  listGitBranches,
  pushChanges,
  type GitEnvState,
} from "../../lib/git-env"
import { collectFileChanges, summarizeChanges } from "../../lib/session-changes"
import { useApp } from "../../lib/store/provider"
import { PopoverSurface } from "../overlay/popover-surface"

/** 拉取请求状态在不可用时的固定文案（参考设计里就是这个形态）。 */
const PR_UNAVAILABLE_TEXT = "无法获取拉取请求状态"

/**
 * 提交信息占位文案。真接入后这一行应改为输入框让用户填写，
 * 现在只用来如实表达「没有接口」这一事实。
 */
const COMMIT_PLACEHOLDER_MESSAGE = "chore: 更新会话内文件变更"

export interface EnvironmentSectionProps {
  sessionID: string | null
  /** 由信息栏的 createResource 注入；undefined 表示仍在拉取。 */
  gitState: GitEnvState | undefined
  gitLoading: boolean
  /** 真实操作成功后刷新环境信息。 */
  onRefreshGit: () => void
  /** 分支下拉的开关状态上报给信息栏，供 Escape 做分层处理。 */
  onOverlayOpenChange: (open: boolean) => void
}

/** 行容器：min-h-8 = 32px，满足触控下限。 */
const Row: Component<{
  icon: JSX.Element
  label: string
  /** 值不可用时整体灰掉——不可用状态由文案本身说明，不依赖 hover。 */
  muted?: boolean
  /** 补充说明（桌面端 hover 可见；触控端的关键信息一律写进正文文案）。 */
  title?: string
  children: JSX.Element
}> = (p) => (
  <div
    class={`flex min-h-8 items-center gap-2 rounded-lg px-2 py-1.5 ${p.muted ? "opacity-70" : ""}`}
    title={p.title}
  >
    <span class="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)]">{p.icon}</span>
    <span class="min-w-0 flex-1 truncate text-[11px] text-[var(--text-secondary)]">{p.label}</span>
    <div class="flex shrink-0 items-center gap-1">{p.children}</div>
  </div>
)

/** 行内动作按钮：min-h-8 = 32px，与行等高。 */
const ActionButton: Component<{ label: string; icon: JSX.Element; disabled?: boolean; onClick: () => void }> = (
  p,
) => (
  <button
    type="button"
    disabled={p.disabled}
    class="flex min-h-8 items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 text-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-60"
    onClick={p.onClick}
  >
    {p.icon}
    {p.label}
  </button>
)

/** 说明条：把「为什么没结果」直接写在界面上，而不是藏在 hover 里。 */
const Notice: Component<{ text: string }> = (p) => (
  <p class="mt-1 flex items-start gap-1.5 rounded-lg bg-[var(--bg-panel)] px-2 py-1.5 text-[10px] leading-relaxed text-[var(--text-muted)]">
    <Info size={12} class="mt-0.5 shrink-0" />
    <span class="min-w-0 flex-1">{p.text}</span>
  </p>
)

export const EnvironmentSection: Component<EnvironmentSectionProps> = (p) => {
  const { store, activeProfile } = useApp()

  /** 会话工作目录：Git 适配层的入参。未选中会话时为空串。 */
  const directory = () => (p.sessionID ? store.store.sessions[p.sessionID]?.directory ?? "" : "")

  /** 环境位置：本地 serve 还是云端服务器。 */
  const location = () => (activeProfile().mode === "local" ? "本地" : "云端")

  /** 变更统计复用 session-changes 的聚合，+0 -0 也要显示。 */
  const changes = createMemo(() =>
    summarizeChanges(collectFileChanges(p.sessionID ? store.sessionMessages(p.sessionID) : [])),
  )

  const branch = () => (p.gitState ? displayBranch(p.gitState) : null)
  const gitReason = () => p.gitState?.reason ?? GIT_UNAVAILABLE_REASON

  // ---- 分支下拉 ----
  let branchTrigger: HTMLButtonElement | undefined
  const [branchOpen, setBranchOpen] = createSignal(false)
  const [branches, setBranches] = createSignal<string[]>([])

  async function toggleBranchMenu() {
    const next = !branchOpen()
    setBranchOpen(next)
    p.onOverlayOpenChange(next)
    if (!next) return
    // 当前必然返回空数组（下拉里因此显示「无可用分支」）；接口补齐后自动出列表。
    const result = await listGitBranches(directory())
    setBranches(result.branches)
  }

  function closeBranchMenu() {
    setBranchOpen(false)
    p.onOverlayOpenChange(false)
  }

  // ---- 提交 / 推送 ----
  const [notice, setNotice] = createSignal<string | null>(null)
  const [busy, setBusy] = createSignal<"commit" | "push" | null>(null)

  async function runGitAction(action: "commit" | "push") {
    setBusy(action)
    setNotice(null)
    try {
      const state =
        action === "commit"
          ? await commitChanges(directory(), COMMIT_PLACEHOLDER_MESSAGE)
          : await pushChanges(directory())
      if (state.availability !== "ready") {
        setNotice(`${action === "commit" ? "提交" : "推送"}未接入：${state.reason ?? GIT_UNAVAILABLE_REASON}`)
        return
      }
      p.onRefreshGit()
    } finally {
      setBusy(null)
    }
  }

  // ---- 拉取请求状态 ----
  // 适配层没有接收 AbortSignal 的入参，这里用「取消后丢弃结果」的方式避免
  // 面板关闭/切换会话后仍把过期结果写回界面。
  let prAbort: AbortController | null = null
  onCleanup(() => prAbort?.abort())

  const [prState] = createResource(
    // 没有会话时用 null 短路，不发无意义的请求。
    () => (p.sessionID ? directory() : null),
    async (dir) => {
      prAbort?.abort()
      const controller = new AbortController()
      prAbort = controller
      const state = await fetchPullRequestStatus(dir)
      return controller.signal.aborted ? GIT_ENV_UNAVAILABLE : state
    },
  )

  return (
    <div class="flex flex-col">
      {/* 变更：+0 -0 也要占位，避免整行在无变更时消失导致行高跳动。 */}
      <Row icon={<GitCommitHorizontal size={13} />} label="变更">
        <span class="font-mono text-[11px] text-[var(--diff-add)]">+{changes().adds}</span>
        <span class="font-mono text-[11px] text-[var(--diff-delete)]">-{changes().dels}</span>
      </Row>

      {/* 本地 / 云端 */}
      <Row icon={<HardDrive size={13} />} label="本地">
        <span class="text-[11px] text-[var(--text-primary)]">{location()}</span>
      </Row>

      {/* 分支：不可用时整行不可点，只显示原因。 */}
      <Show
        when={branch() !== null}
        fallback={
          <Row icon={<GitBranch size={13} />} label="分支" muted>
            <span class="truncate text-[10px] text-[var(--text-muted)]">{gitReason()}</span>
          </Row>
        }
      >
        <Row icon={<GitBranch size={13} />} label="分支">
          <button
            ref={branchTrigger}
            type="button"
            class="flex min-h-8 min-w-0 items-center gap-1 rounded-lg px-1.5 text-[11px] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
            aria-haspopup="menu"
            aria-expanded={branchOpen()}
            onClick={() => void toggleBranchMenu()}
          >
            <span class="max-w-28 truncate">{branch()}</span>
          </button>
        </Row>
      </Show>

      {/* 分支下拉：结构保留（点击外部 / Escape 关闭由 PopoverSurface 提供）。 */}
      <PopoverSurface
        open={branchOpen() && branch() !== null}
        reference={branchOpen() ? branchTrigger ?? null : null}
        onClose={closeBranchMenu}
        align="end"
        width={220}
      >
        <div class="max-h-56 overflow-y-auto" role="menu" aria-label="切换分支">
          <Show
            when={branches().length > 0}
            fallback={<p class="px-3 py-2 text-[11px] text-[var(--text-muted)]">无可用分支</p>}
          >
            <For each={branches()}>
              {(name) => (
                <button
                  type="button"
                  role="menuitem"
                  class="flex min-h-8 w-full items-center gap-2 px-3 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
                  onClick={closeBranchMenu}
                >
                  <GitBranch size={12} class="shrink-0 text-[var(--text-muted)]" />
                  <span class="min-w-0 flex-1 truncate">{name}</span>
                </button>
              )}
            </For>
          </Show>
        </div>
      </PopoverSurface>

      {/* 提交 / 推送：当前必然不可用，点击后如实说明未接入，不做任何假操作。 */}
      <Row icon={<CloudUpload size={13} />} label="提交或推送">
        <ActionButton
          label={busy() === "commit" ? "处理中" : "提交"}
          icon={<GitCommitHorizontal size={12} />}
          disabled={busy() !== null}
          onClick={() => void runGitAction("commit")}
        />
        <ActionButton
          label={busy() === "push" ? "处理中" : "推送"}
          icon={<CloudUpload size={12} />}
          disabled={busy() !== null}
          onClick={() => void runGitAction("push")}
        />
      </Row>

      {/* 拉取请求状态 */}
      <Row
        icon={<GitPullRequest size={13} />}
        label="拉取请求状态"
        title={prState()?.reason ?? PR_UNAVAILABLE_TEXT}
      >
        <Show
          when={!prState.loading}
          fallback={
            <>
              <LoaderCircle size={12} class="shrink-0 animate-spin text-[var(--text-muted)]" />
              <span class="text-[10px] text-[var(--text-muted)]">读取中</span>
            </>
          }
        >
          <Show
            when={prState()?.availability === "ready"}
            fallback={<span class="text-[10px] text-[var(--text-muted)]">{PR_UNAVAILABLE_TEXT}</span>}
          >
            {/* 适配层目前只回传「可用性」，没有 PR 编号/状态字段，故只显示「可用」。 */}
            <span class="text-[10px] text-[var(--success)]">可用</span>
          </Show>
        </Show>
      </Row>

      <Show when={notice()}>{(text) => <Notice text={text()} />}</Show>
    </div>
  )
}
