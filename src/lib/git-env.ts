// Git 环境信息适配层。
//
// ⚠️ 现状（重要）：`mimo serve` **没有**任何 Git HTTP 接口。
// 已核对服务端路由全集：/session/*、/global/event、/global/health、
// /permission/:id/reply、/question/:id/reply|reject、/pty/*、/file、/find ——
// 无 git 相关端点；本仓库 src/lib/protocol/client.ts 与 src-tauri/ 同样没有。
//
// 因此「分支选择 / 提交 / 推送 / 拉取请求状态」四项当前**无法**接到真实数据。
// 这里不造假数据：统一走 unavailable 状态，UI 照参考设计显示为灰掉的说明行
// （参考图里「无法获取拉取请求状态」本身就是这种降级形态）。
//
// 接入方式（将来服务端补齐时只需改这一个文件）：
//   1. 在 GitEnvProvider 里用 client.get("/git/...") 实现 fetchSnapshot 等方法；
//   2. 确认返回结构与 GitEnvSnapshot 一致；
//   3. 在 setGitEnvProvider() 处注册即可，UI 层无需改动。

export type GitEnvAvailability = "ready" | "unavailable" | "error" | "idle"

export interface GitEnvSnapshot {
  /** 当前分支；不在仓库内或未知时为 null。 */
  branch: string | null
  /** 本地领先远端的提交数。 */
  ahead: number
  /** 本地落后远端的提交数。 */
  behind: number
  /** 工作区是否有未提交变更。 */
  dirty: boolean
  /** 远端仓库地址（脱敏后用于展示）。 */
  remote: string | null
}

export interface GitEnvState {
  availability: GitEnvAvailability
  snapshot: GitEnvSnapshot | null
  /** availability 非 ready 时给用户看的原因（中文、可直接展示）。 */
  reason: string | null
}

/** 服务端未提供 Git 接口时统一使用的说明文案。 */
export const GIT_UNAVAILABLE_REASON = "服务端未提供 Git 接口"

export const EMPTY_GIT_SNAPSHOT: GitEnvSnapshot = {
  branch: null,
  ahead: 0,
  behind: 0,
  dirty: false,
  remote: null,
}

export const GIT_ENV_UNAVAILABLE: GitEnvState = {
  availability: "unavailable",
  snapshot: null,
  reason: GIT_UNAVAILABLE_REASON,
}

/**
 * Git 环境信息的可插拔提供者。
 * 现有实现恒为「不可用」；接入真实接口时实现这些方法并注册即可。
 */
export interface GitEnvProvider {
  fetchSnapshot(directory: string): Promise<GitEnvState>
  listBranches(directory: string): Promise<{ branches: string[]; current: string | null }>
  commit(directory: string, message: string): Promise<GitEnvState>
  push(directory: string): Promise<GitEnvState>
  pullRequestStatus(directory: string): Promise<GitEnvState>
}

const unavailableProvider: GitEnvProvider = {
  async fetchSnapshot() {
    return GIT_ENV_UNAVAILABLE
  },
  async listBranches() {
    return { branches: [], current: null }
  },
  async commit() {
    return GIT_ENV_UNAVAILABLE
  },
  async push() {
    return GIT_ENV_UNAVAILABLE
  },
  async pullRequestStatus() {
    return GIT_ENV_UNAVAILABLE
  },
}

let provider: GitEnvProvider = unavailableProvider

export function setGitEnvProvider(next: GitEnvProvider): void {
  provider = next
}

export function getGitEnvProvider(): GitEnvProvider {
  return provider
}

export function fetchGitEnv(directory: string): Promise<GitEnvState> {
  return provider.fetchSnapshot(directory)
}

export function listGitBranches(directory: string) {
  return provider.listBranches(directory)
}

export function commitChanges(directory: string, message: string) {
  return provider.commit(directory, message)
}

export function pushChanges(directory: string) {
  return provider.push(directory)
}

export function fetchPullRequestStatus(directory: string) {
  return provider.pullRequestStatus(directory)
}

/** 展示用分支名：未接入时返回 null，由 UI 决定降级文案。 */
export function displayBranch(state: GitEnvState): string | null {
  if (state.availability !== "ready" || !state.snapshot) return null
  return state.snapshot.branch
}

/** 远端地址脱敏：只保留 host 与 owner/repo，移除可能的凭据段。 */
export function sanitizeRemote(remote: string | null): string | null {
  if (!remote) return null
  const cleaned = remote.replace(/^[a-z+]+:\/\//i, "").replace(/^[^@/]*@/, "")
  const parts = cleaned.split("/")
  if (parts.length < 3) return cleaned.split(":")[0] ?? cleaned
  return `${parts[0]}/${parts[1]}/${parts[2]}`
}
