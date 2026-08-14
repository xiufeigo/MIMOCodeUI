export type ServerMode = "local" | "remote"

/** 本地 serve 启动方式：mimo / opencode，可选在 WSL 发行版内启动。 */
export type LocalServeKind = "mimo" | "opencode"

export interface LocalServeConfig {
  /** 本地 serve 二进制：mimo（默认）或 opencode。 */
  kind: LocalServeKind
  /** 非空时通过 `wsl -d <distro>` 在 WSL 内启动。 */
  wsl?: string
}

export interface ServerProfile {
  id: string
  name: string
  mode: ServerMode
  url?: string
  username?: string
  password?: string
  /** 仅本地模式生效：启动哪个 serve（mimo/opencode + 可选 WSL）。 */
  localServe?: LocalServeConfig
}

export interface ServerProfileStore {
  version: 1
  activeID: string
  /** 应用启动时是否自动拉起本地 serve（激活配置为本地时）。 */
  autoStartLocal: boolean
  profiles: ServerProfile[]
}

export interface LegacySavedConnection {
  mode: ServerMode
  url?: string
  username?: string
  password?: string
}

export const LOCAL_SERVER_ID = "local"
export const SERVER_PROFILE_STORE_KEY = "mimocode-ui.server-profiles.v1"
export const LEGACY_SAVED_CONNECTION_KEY = "mimocode-ui:connection"

export const LOCAL_SERVER_PROFILE: ServerProfile = {
  id: LOCAL_SERVER_ID,
  name: "本地",
  mode: "local",
}

function fallbackID(): string {
  return `server-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createServerProfileID(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : fallbackID()
}

export function defaultServerProfileStore(): ServerProfileStore {
  return { version: 1, activeID: LOCAL_SERVER_ID, autoStartLocal: true, profiles: [LOCAL_SERVER_PROFILE] }
}

export function normalizeServerProfileStore(value: unknown): ServerProfileStore {
  if (!value || typeof value !== "object") return defaultServerProfileStore()
  const candidate = value as Partial<ServerProfileStore>
  const remotes = Array.isArray(candidate.profiles)
    ? candidate.profiles.filter(
        (profile): profile is ServerProfile =>
          Boolean(profile) &&
          typeof profile.id === "string" &&
          typeof profile.name === "string" &&
          (profile.mode === "local" || profile.mode === "remote"),
      )
    : []
  const localProfile: ServerProfile = { ...LOCAL_SERVER_PROFILE }
  const storedLocal = remotes.find((profile) => profile.id === LOCAL_SERVER_ID)
  if (storedLocal?.localServe) localProfile.localServe = storedLocal.localServe
  const profiles = [localProfile, ...remotes.filter((profile) => profile.id !== LOCAL_SERVER_ID)]
  const activeID = profiles.some((profile) => profile.id === candidate.activeID) ? candidate.activeID! : LOCAL_SERVER_ID
  return { version: 1, activeID, autoStartLocal: candidate.autoStartLocal !== false, profiles }
}

export function migrateLegacyConnection(value: LegacySavedConnection | null): ServerProfileStore {
  const base = defaultServerProfileStore()
  if (!value || value.mode !== "remote" || !value.url) return base
  const remote: ServerProfile = {
    id: "legacy-remote",
    name: "云端服务器",
    mode: "remote",
    url: value.url,
    username: value.username || "mimocode",
    password: value.password ?? "",
  }
  return { version: 1, activeID: remote.id, autoStartLocal: true, profiles: [LOCAL_SERVER_PROFILE, remote] }
}

export function upsertServerProfile(store: ServerProfileStore, profile: ServerProfile): ServerProfileStore {
  const next = normalizeServerProfileStore(store)
  if (profile.id === LOCAL_SERVER_ID) {
    const local: ServerProfile = { ...LOCAL_SERVER_PROFILE }
    if (profile.localServe) local.localServe = profile.localServe
    return { ...next, profiles: [local, ...next.profiles.slice(1)] }
  }
  const profiles = next.profiles.some((item) => item.id === profile.id)
    ? next.profiles.map((item) => (item.id === profile.id ? profile : item))
    : [...next.profiles, profile]
  return { ...next, profiles }
}

export function removeServerProfile(store: ServerProfileStore, id: string): ServerProfileStore {
  if (id === LOCAL_SERVER_ID) return normalizeServerProfileStore(store)
  const next = normalizeServerProfileStore(store)
  const profiles = next.profiles.filter((profile) => profile.id !== id)
  return { version: 1, profiles, activeID: next.activeID === id ? LOCAL_SERVER_ID : next.activeID, autoStartLocal: next.autoStartLocal }
}
