// App-level provider: owns the current server client, its SSE subscription,
// and the server-profile collection used by the new-task workspace.

import { createContext, useContext, onMount, onCleanup, createSignal, type ParentProps } from "solid-js"
import { MimoClient, type ServerConnection } from "../protocol/client"
import { createAppStore, type AppStore, type ConnectionState } from "./app-store"
import {
  LEGACY_SAVED_CONNECTION_KEY,
  LOCAL_SERVER_ID,
  SERVER_PROFILE_STORE_KEY,
  createServerProfileID,
  defaultServerProfileStore,
  migrateLegacyConnection,
  normalizeServerProfileStore,
  removeServerProfile as removeProfile,
  upsertServerProfile,
  type LegacySavedConnection,
  type LocalServeConfig,
  type ServerProfile,
  type ServerProfileStore,
} from "../server-profiles"

export type { ServerProfile, LocalServeConfig } from "../server-profiles"
export type SavedConnection = LegacySavedConnection
export const SAVED_CONNECTION_KEY = LEGACY_SAVED_CONNECTION_KEY

export interface ServeHandle {
  url: string
  port: number
  pid?: number
  password: string
  username: string
  kind?: string
}

/** 本地 serve 启动参数（与 Rust LocalServeSpec 对应）。 */
export interface LocalServeSpec {
  kind?: "mimo" | "opencode"
  wsl?: string
}

export interface TauriBridge {
  startLocalServe(spec?: LocalServeSpec): Promise<ServeHandle>
  stopLocalServe(): Promise<void>
  localServeStatus(): Promise<{ running: boolean; url?: string; kind?: string } | null>
  isTauri(): boolean
  /** 运行平台（windows / macos / linux / android / ios …）。 */
  platform(): string
}

export function createBrowserBridge(): TauriBridge {
  return {
    async startLocalServe() {
      throw new Error("当前运行在浏览器模式，不支持本地启动 serve，请连接云端服务器。")
    },
    async stopLocalServe() {},
    async localServeStatus() {
      return null
    },
    isTauri() {
      return false
    },
    platform() {
      return "browser"
    },
  }
}

async function loadTauriBridge(): Promise<TauriBridge> {
  const mod = await import("@tauri-apps/api/core")
  if (typeof mod.invoke !== "function") throw new Error("Tauri runtime unavailable（invoke 不可用）")
  const platform = await mod.invoke<string>("app_platform").catch(() => "unknown")
  return {
    startLocalServe: (spec) => mod.invoke<ServeHandle>("start_local_serve", { spec }),
    stopLocalServe: () => mod.invoke("stop_local_serve"),
    localServeStatus: () => mod.invoke<{ running: boolean; url?: string; kind?: string } | null>("local_serve_status"),
    isTauri: () => true,
    platform: () => platform,
  }
}

function loadProfileStore(): ServerProfileStore {
  try {
    const raw = localStorage.getItem(SERVER_PROFILE_STORE_KEY)
    if (raw) return normalizeServerProfileStore(JSON.parse(raw))
    const legacy = localStorage.getItem(LEGACY_SAVED_CONNECTION_KEY)
    const migrated = migrateLegacyConnection(legacy ? (JSON.parse(legacy) as LegacySavedConnection) : null)
    localStorage.setItem(SERVER_PROFILE_STORE_KEY, JSON.stringify(migrated))
    return migrated
  } catch {
    return defaultServerProfileStore()
  }
}

function persistProfileStore(profiles: ServerProfileStore) {
  try {
    localStorage.setItem(SERVER_PROFILE_STORE_KEY, JSON.stringify(profiles))
  } catch {
    // Storage can be unavailable in private browsing; runtime state remains usable.
  }
}

interface AppContextValue {
  store: AppStore
  bridge: () => TauriBridge
  /** 当前运行平台（browser 表示浏览器调试模式）。 */
  platform: () => string
  client: () => MimoClient | null
  connectExternal(url: string, username: string, password: string): Promise<void>
  connectLocal(): Promise<boolean>
  disconnect(): void
  connection: () => ConnectionState
  connectionError: () => string | null
  profiles: () => ServerProfile[]
  activeProfile: () => ServerProfile
  setActiveProfile(profileID: string, force?: boolean): Promise<void>
  saveProfile(profile: Omit<ServerProfile, "id"> & { id?: string }): Promise<ServerProfile>
  deleteProfile(profileID: string): void
  /** 应用启动时是否自动拉起本地 serve（激活配置为本地时）。 */
  autoStartLocal: () => boolean
  setAutoStartLocal(value: boolean): void
  /** 更新本地 serve 启动配置（mimo/opencode + 可选 WSL），持久化但不断开。 */
  setLocalServe(config: LocalServeConfig): void
  /** Legacy surface consumed by the existing settings and tooltip components. */
  savedConnection: () => SavedConnection | null
  saveConnection(cfg: SavedConnection): Promise<void>
  clearConnection(): Promise<void>
}

const AppContext = createContext<AppContextValue>()

export function AppProvider(props: ParentProps) {
  const store = createAppStore()
  const [bridge, setBridge] = createSignal<TauriBridge>(createBrowserBridge())
  const [platform, setPlatform] = createSignal<string>("browser")
  const [client, setClient] = createSignal<MimoClient | null>(null)
  const [connError, setConnError] = createSignal<string | null>(null)
  const [profileStore, setProfileStore] = createSignal<ServerProfileStore>(loadProfileStore())

  let abortCtrl: AbortController | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempt = 0
  let connectedSeq = 0
  let localSidecarRunning = false

  const profiles = () => profileStore().profiles
  const activeProfile = () => profiles().find((profile) => profile.id === profileStore().activeID) ?? profiles()[0]
  const savedConnection = (): SavedConnection | null => {
    const profile = activeProfile()
    return profile.mode === "remote"
      ? { mode: "remote", url: profile.url, username: profile.username, password: profile.password }
      : { mode: "local" }
  }

  onMount(async () => {
    const isTauriEnv = typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined"
    if (isTauriEnv) {
      const loaded = await loadTauriBridge()
      setBridge(loaded)
      setPlatform(loaded.platform())
    }
    const initial = activeProfile()
    // 安卓版不支持本地 serve：激活配置为本地时不自动连接，改用首个云端配置。
    if (platform() === "android" && initial.mode === "local") {
      const remote = profiles().find((profile) => profile.mode === "remote")
      if (remote) {
        try {
          await activateProfile(remote, false)
        } catch {
          // The disconnected workspace contains a settings entry for recovery.
        }
      }
      return
    }
    // 用户关闭「随应用启动本地服务器」且激活配置为本地：不自动拉起 serve。
    if (initial.mode === "local" && !profileStore().autoStartLocal) return
    try {
      await activateProfile(initial, false)
    } catch {
      // The disconnected workspace contains a settings entry for recovery.
    }
  })

  onCleanup(() => {
    abortCtrl?.abort()
    if (reconnectTimer) clearTimeout(reconnectTimer)
  })

  function setConnectionState(state: ConnectionState) {
    store.setConn(state)
  }

  function stopReconnect() {
    connectedSeq++
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    reconnectAttempt = 0
  }

  async function subscribe(c: MimoClient) {
    abortCtrl?.abort()
    abortCtrl = new AbortController()
    const signal = abortCtrl.signal
    const sequence = ++connectedSeq
    const scheduleReconnect = () => {
      if (sequence !== connectedSeq) return
      if (reconnectTimer) clearTimeout(reconnectTimer)
      const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000)
      reconnectAttempt++
      reconnectTimer = setTimeout(() => {
        const current = client()
        if (current) void subscribe(current)
      }, delay)
    }

    try {
      for await (const envelope of c.eventStream(signal)) {
        if (sequence !== connectedSeq) return
        reconnectAttempt = 0
        if (envelope.payload?.type === "server.connected") {
          setConnectionState({
            status: "connected",
            serverVersion: (envelope.payload.properties as { version?: string })?.version,
          })
          void c.listPermissions().then((requests) => {
            if (sequence === connectedSeq) store.backfillPermissions(requests)
          }).catch(() => {})
        }
        store.ingest([envelope])
      }
      if (sequence === connectedSeq && !signal.aborted) {
        setConnectionState({ status: "disconnected" })
        scheduleReconnect()
      }
    } catch (error) {
      if (signal.aborted) return
      setConnectionState({ status: "error", message: (error as Error).message })
      scheduleReconnect()
    }
  }

  async function resolveProfileConnection(profile: ServerProfile): Promise<ServerConnection> {
    if (profile.mode === "remote") {
      const url = profile.url?.replace(/\/+$/, "")
      if (!url || !/^https?:\/\//.test(url)) throw new Error("云端服务器地址需要以 http:// 或 https:// 开头")
      return { baseUrl: url, username: profile.username ?? "", password: profile.password ?? "" }
    }
    if (platform() === "android") {
      throw new Error("安卓版不支持本地服务器，请在设置中添加云端服务器地址。")
    }
    if (!bridge().isTauri()) throw new Error("浏览器模式无法启动本地服务器，请选择云端服务器。")
    const handle = await bridge().startLocalServe(
      profile.localServe ? { kind: profile.localServe.kind, wsl: profile.localServe.wsl } : undefined,
    )
    localSidecarRunning = true
    return { baseUrl: handle.url, username: handle.username, password: handle.password }
  }

  async function activateProfile(profile: ServerProfile, resetWorkspace: boolean) {
    const previous = activeProfile()
    const hadClient = client() !== null
    const hadLocalSidecar = localSidecarRunning
    if (!hadClient) setConnectionState({ status: "connecting" })
    setConnError(null)
    let candidate: MimoClient
    let health: { healthy: boolean; version?: string }
    try {
      candidate = new MimoClient(await resolveProfileConnection(profile))
      health = await candidate.health()
      if (!health.healthy) throw new Error("服务器健康检查未通过")
    } catch (error) {
      if (profile.mode === "local" && !hadLocalSidecar && localSidecarRunning) {
        await bridge().stopLocalServe().catch(() => {})
        localSidecarRunning = false
      }
      if (!hadClient) setConnectionState({ status: "error", message: (error as Error).message })
      throw error
    }

    stopReconnect()
    abortCtrl?.abort()
    if (previous.mode === "local" && profile.mode !== "local" && localSidecarRunning) {
      await bridge().stopLocalServe().catch(() => {})
      localSidecarRunning = false
    }
    if (resetWorkspace) store.reset()
    setClient(candidate)
    setProfileStore((current) => {
      const next = { ...upsertServerProfile(current, profile), activeID: profile.id }
      persistProfileStore(next)
      return next
    })
    setConnectionState({ status: "connected", serverVersion: health.version })
    void subscribe(candidate)
  }

  async function setActiveProfile(profileID: string, force = false) {
    const target = profiles().find((profile) => profile.id === profileID)
    if (!target) throw new Error("服务器配置不存在")
    if (!force && target.id === activeProfile().id && client()) return
    const previousState = store.conn()
    const hadClient = client() !== null
    try {
      await activateProfile(target, true)
    } catch (error) {
      setConnError((error as Error).message)
      if (hadClient) setConnectionState(previousState)
      throw error
    }
  }

  async function connectExternal(url: string, username: string, password: string) {
    await saveProfile({
      name: "云端服务器",
      mode: "remote",
      url,
      username,
      password,
    })
  }

  async function connectLocal(): Promise<boolean> {
    try {
      await setActiveProfile(LOCAL_SERVER_ID)
      return true
    } catch (error) {
      const message = (error as Error).message
      setConnError(message)
      setConnectionState({ status: "error", message })
      return false
    }
  }

  function disconnect() {
    stopReconnect()
    abortCtrl?.abort()
    setClient(null)
    setConnectionState({ status: "disconnected" })
  }

  async function saveProfile(profile: Omit<ServerProfile, "id"> & { id?: string }): Promise<ServerProfile> {
    const nextProfile: ServerProfile = { ...profile, id: profile.id ?? createServerProfileID() }
    await activateProfile(nextProfile, true)
    return nextProfile
  }

  function deleteProfile(profileID: string) {
    if (profileID === activeProfile().id) throw new Error("请先切换到其他服务器后再删除当前服务器")
    setProfileStore((current) => {
      const next = removeProfile(current, profileID)
      persistProfileStore(next)
      return next
    })
  }

  function setAutoStartLocal(value: boolean) {
    setProfileStore((current) => {
      const next = { ...current, autoStartLocal: value }
      persistProfileStore(next)
      return next
    })
  }

  function setLocalServe(config: LocalServeConfig) {
    setProfileStore((current) => {
      const local = current.profiles.find((profile) => profile.id === LOCAL_SERVER_ID) ?? {
        id: LOCAL_SERVER_ID,
        name: "本地",
        mode: "local" as const,
      }
      const updated: ServerProfile = { ...local, localServe: config }
      const next = upsertServerProfile(current, updated)
      persistProfileStore(next)
      return next
    })
  }

  async function saveConnection(cfg: SavedConnection) {
    if (cfg.mode === "local") {
      await setActiveProfile(LOCAL_SERVER_ID)
      return
    }
    const currentRemote = profiles().find((profile) => profile.mode === "remote" && profile.id === activeProfile().id)
    await saveProfile({
      id: currentRemote?.id,
      name: currentRemote?.name || "云端服务器",
      mode: "remote",
      url: cfg.url,
      username: cfg.username || "mimocode",
      password: cfg.password,
    })
  }

  async function clearConnection() {
    disconnect()
    const defaults = defaultServerProfileStore()
    setProfileStore(defaults)
    persistProfileStore(defaults)
  }

  return (
    <AppContext.Provider
      value={{
        store,
        bridge,
        platform,
        client,
        connectExternal,
        connectLocal,
        disconnect,
        connection: store.conn,
        connectionError: connError,
        profiles,
        activeProfile,
        setActiveProfile,
        saveProfile,
        deleteProfile,
        autoStartLocal: () => profileStore().autoStartLocal,
        setAutoStartLocal,
        setLocalServe,
        savedConnection,
        saveConnection,
        clearConnection,
      }}
    >
      {props.children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error("useApp must be used within AppProvider")
  return context
}

export function useClient(): () => MimoClient | null {
  return useApp().client
}
