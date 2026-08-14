import { createEffect, createSignal, For, onCleanup, Show, type Component } from "solid-js"
import { Check, HardDrive, Pencil, Play, Plus, Server, Square, Trash2, X } from "lucide-solid"
import { useApp, type ServerProfile } from "../../lib/store/provider"
import { LOCAL_SERVER_ID } from "../../lib/server-profiles"
import { BTN_CLASS, INPUT_CLASS, PRIMARY_BTN_CLASS, Row, Section, Toggle } from "./ui"

const emptyRemote = (): Omit<ServerProfile, "id"> => ({
  name: "云端服务器",
  mode: "remote",
  url: "",
  username: "mimocode",
  password: "",
})

interface ServeStatus {
  running: boolean
  url?: string
  kind?: string
}

/** 本地启动方式选择项 → { kind, wsl }。 */
const LAUNCH_OPTIONS = [
  { value: "mimo", label: "mimo serve（本机）" },
  { value: "opencode", label: "opencode serve（本机）" },
  { value: "mimo-wsl", label: "mimo serve（WSL）" },
  { value: "opencode-wsl", label: "opencode serve（WSL）" },
] as const

/** Manage the local profile (mimo/opencode/WSL) and multiple saved remote profiles. */
export const SettingsServers: Component<{ onChanged: () => void }> = (p) => {
  const {
    connection,
    bridge,
    platform,
    profiles,
    activeProfile,
    setActiveProfile,
    saveProfile,
    deleteProfile,
    autoStartLocal,
    setAutoStartLocal,
    setLocalServe,
    disconnect,
  } = useApp()
  const isAndroid = () => platform() === "android"
  const [draft, setDraft] = createSignal<(Omit<ServerProfile, "id"> & { id?: string }) | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [localBusy, setLocalBusy] = createSignal(false)
  const [err, setErr] = createSignal<string | null>(null)
  const [serveStatus, setServeStatus] = createSignal<ServeStatus | null>(null)

  const conn = () => connection()
  const localProfile = () => profiles().find((profile) => profile.id === LOCAL_SERVER_ID)
  const localServe = () => localProfile()?.localServe ?? { kind: "mimo" as const, wsl: "" }
  const wslOn = () => {
    const wsl = localServe().wsl
    return Boolean(wsl && wsl.trim())
  }
  const launchValue = () => {
    if (wslOn()) return localServe().kind === "opencode" ? "opencode-wsl" : "mimo-wsl"
    return localServe().kind === "opencode" ? "opencode" : "mimo"
  }
  const kindLabel = () => (localServe().kind === "opencode" ? "opencode" : "mimo")

  // 周期轮询本地 serve 状态（仅 Tauri 环境）。
  createEffect(() => {
    if (!bridge().isTauri()) return
    void bridge()
      .localServeStatus()
      .then(setServeStatus)
      .catch(() => {})
    const timer = setInterval(() => {
      void bridge()
        .localServeStatus()
        .then(setServeStatus)
        .catch(() => {})
    }, 2000)
    onCleanup(() => clearInterval(timer))
  })

  function applyLaunch(value: string) {
    if (value === "opencode") setLocalServe({ kind: "opencode", wsl: "" })
    else if (value === "mimo-wsl") setLocalServe({ kind: "mimo", wsl: localServe().wsl?.trim() || "Ubuntu" })
    else if (value === "opencode-wsl") setLocalServe({ kind: "opencode", wsl: localServe().wsl?.trim() || "Ubuntu" })
    else setLocalServe({ kind: "mimo", wsl: "" })
  }

  async function startLocal() {
    setLocalBusy(true)
    setErr(null)
    try {
      await setActiveProfile(LOCAL_SERVER_ID, true)
      setServeStatus(await bridge().localServeStatus())
      p.onChanged()
    } catch (cause) {
      setErr((cause as Error).message)
    } finally {
      setLocalBusy(false)
    }
  }

  async function stopLocal() {
    setLocalBusy(true)
    setErr(null)
    try {
      await bridge().stopLocalServe()
      if (activeProfile().mode === "local") disconnect()
      setServeStatus(await bridge().localServeStatus())
    } catch (cause) {
      setErr((cause as Error).message)
    } finally {
      setLocalBusy(false)
    }
  }

  function edit(profile?: ServerProfile) {
    setErr(null)
    setDraft(profile ? { ...profile } : emptyRemote())
  }

  async function saveDraft() {
    const value = draft()
    if (!value) return
    if (value.mode === "remote") {
      if (!value.name.trim()) {
        setErr("请输入服务器名称")
        return
      }
      if (!value.url?.trim()) {
        setErr("请输入服务器地址")
        return
      }
    }
    setBusy(true)
    setErr(null)
    try {
      await saveProfile({ ...value, name: value.name.trim(), url: value.url?.trim() })
      setDraft(null)
      p.onChanged()
    } catch (cause) {
      setErr((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function activate(profile: ServerProfile) {
    setBusy(true)
    setErr(null)
    try {
      await setActiveProfile(profile.id)
      p.onChanged()
    } catch (cause) {
      setErr((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function remove(profile: ServerProfile) {
    try {
      deleteProfile(profile.id)
    } catch (cause) {
      setErr((cause as Error).message)
    }
  }

  return (
    <div>
      <Show when={err()}>
        <p class="mb-3 text-xs text-red-500">{err()}</p>
      </Show>

      {/* 当前连接 */}
      <Section title="当前连接">
        <Row
          title={conn().status === "connected" ? activeProfile().name : conn().status === "connecting" ? "连接中…" : "未连接"}
          description={
            conn().status === "connected"
              ? `v${(conn() as { serverVersion?: string }).serverVersion ?? "?"} · ${activeProfile().mode === "local" ? `本地服务器（${kindLabel()}）` : "云端服务器"}`
              : conn().status === "error"
                ? (conn() as { message: string }).message
                : "选择并连接一个服务器"
          }
        >
          <span
            class={`h-2.5 w-2.5 rounded-full ${
              conn().status === "connected"
                ? "bg-emerald-500"
                : conn().status === "connecting"
                  ? "bg-amber-400"
                  : "bg-neutral-300"
            }`}
          />
        </Row>
      </Section>

      {/* 本地服务器设置（安卓版不支持本地 serve，隐藏整块） */}
      <Show when={!isAndroid()}>
        <Section
          title="本地服务器"
        action={
          <Show when={bridge().isTauri()}>
            <span
              class={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                serveStatus()?.running ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200/70 text-neutral-500"
              }`}
            >
              <span class={`h-1.5 w-1.5 rounded-full ${serveStatus()?.running ? "bg-emerald-500" : "bg-neutral-400"}`} />
              {serveStatus()?.running ? `运行中 · ${serveStatus()?.url ?? ""}` : "未运行"}
            </span>
          </Show>
        }
      >
        <Row title="启动方式" description="自定义本地启动 mimo serve 或 opencode serve，支持 WSL">
          <select
            class="rounded-md border border-[var(--set-border-soft)] bg-[var(--set-input-bg)] px-2 py-1 text-sm text-[var(--set-text)] outline-none hover:border-[var(--set-accent-soft)] focus:border-[var(--accent)]"
            value={launchValue()}
            onChange={(e) => applyLaunch(e.currentTarget.value)}
          >
            <For each={LAUNCH_OPTIONS}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </Row>
        <Show when={wslOn()}>
          <Row title="WSL 发行版" description="wsl -d <发行版>，例如 Ubuntu">
            <input
              class={`${INPUT_CLASS} w-44`}
              placeholder="Ubuntu"
              value={localServe().wsl ?? ""}
              onInput={(e) => setLocalServe({ kind: localServe().kind, wsl: e.currentTarget.value })}
            />
          </Row>
        </Show>
        <Row title="随应用启动" description="应用启动时自动拉起本地服务器（激活配置为本地时）">
          <Toggle checked={autoStartLocal()} onChange={(v) => setAutoStartLocal(v)} />
        </Row>
        <Row title="启动密码" description="每次启动生成随机密码，仅用于本机 Basic 认证">
          <span class="font-mono text-xs text-[var(--set-text-muted)]">{localServe().kind === "opencode" ? "opencode" : "mimocode"} · 随机</span>
        </Row>
        <div class="flex items-center gap-2 border-t border-[var(--set-border-soft)] py-2.5">
          <Show when={bridge().isTauri()} fallback={<p class="text-xs text-[var(--set-text-muted)]">浏览器模式仅支持云端服务器。</p>}>
            <button
              class={`${PRIMARY_BTN_CLASS} flex items-center gap-1.5`}
              disabled={
                localBusy() ||
                (serveStatus()?.running && activeProfile().mode === "local" && conn().status === "connected")
              }
              onClick={() => void startLocal()}
              title="启动本地服务器并连接"
            >
              <Play size={14} />
              {localBusy() ? "启动中…" : "启动并连接"}
            </button>
            <button class={`${BTN_CLASS} flex items-center gap-1.5`} disabled={localBusy() || !serveStatus()?.running} onClick={() => void stopLocal()}>
              <Square size={13} />
              停止
            </button>
            <p class="text-xs text-[var(--set-text-muted)]">
              本机需安装 {kindLabel()}（{kindLabel() === "opencode" ? "npm i -g opencode-ai" : "npm i -g @mimo-ai/cli"}）
              {wslOn() ? `；WSL 发行版「${localServe().wsl}」内需安装 ${kindLabel()}` : ""}
            </p>
          </Show>
        </div>
        </Section>
      </Show>

      {/* 服务器列表（本地 + 云端） */}
      <Section title="服务器">
        <div class="py-2">
          <For each={profiles().filter((profile) => !isAndroid() || profile.mode !== "local")}>
            {(profile) => (
              <div
                class={`flex items-center gap-2 rounded-lg border-b border-[var(--set-border-soft)] px-2 py-2 last:border-b-0 ${
                  profile.id === activeProfile().id ? "bg-[var(--set-accent-tint)]" : "hover:bg-[var(--set-hover)]"
                }`}
              >
                {profile.mode === "local" ? (
                  <HardDrive size={16} class="shrink-0 text-[var(--set-text-muted)]" />
                ) : (
                  <Server size={16} class="shrink-0 text-[var(--set-text-muted)]" />
                )}
                <button class="min-w-0 flex-1 text-left" disabled={busy()} onClick={() => void activate(profile)}>
                  <span class="block truncate text-sm text-[var(--set-text)]">{profile.name}</span>
                  <span class="block truncate text-xs text-[var(--set-text-muted)]">
                    {profile.mode === "local"
                      ? `本地 · ${profile.localServe?.kind === "opencode" ? "opencode serve" : "mimo serve"}${profile.localServe?.wsl ? `（WSL ${profile.localServe.wsl}）` : ""}`
                      : profile.url}
                  </span>
                </button>
                <Show when={profile.id === activeProfile().id}>
                  <Check size={15} class="shrink-0 text-[var(--accent)]" />
                </Show>
                <Show when={profile.mode === "remote"}>
                  <button class="flex h-7 w-7 items-center justify-center rounded text-[var(--set-text-muted)] hover:bg-[var(--set-hover)]" title="编辑" onClick={() => edit(profile)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    class="flex h-7 w-7 items-center justify-center rounded text-[var(--set-text-muted)] hover:bg-red-50 hover:text-red-500"
                    title="删除"
                    onClick={() => remove(profile)}
                  >
                    <Trash2 size={14} />
                  </button>
                </Show>
              </div>
            )}
          </For>
          <button
            class="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--set-text-secondary)] hover:bg-[var(--set-hover)] hover:text-[var(--set-text)]"
            onClick={() => edit()}
          >
            <Plus size={16} /> 添加云端服务器
          </button>
        </div>
      </Section>

      <Show when={draft()}>
        {(value) => (
          <Section title={value().id ? "编辑云端服务器" : "添加云端服务器"}>
            <div class="flex flex-col gap-2 py-2.5">
              <input class={INPUT_CLASS} placeholder="显示名称" value={value().name} onInput={(event) => setDraft({ ...value(), name: event.currentTarget.value })} />
              <input class={INPUT_CLASS} placeholder="服务器地址，如 https://mimo.example.com" value={value().url ?? ""} onInput={(event) => setDraft({ ...value(), url: event.currentTarget.value })} />
              <input class={INPUT_CLASS} placeholder="用户名（默认 mimocode）" value={value().username ?? ""} onInput={(event) => setDraft({ ...value(), username: event.currentTarget.value })} />
              <input
                class={INPUT_CLASS}
                placeholder="密码（MIMOCODE_SERVER_PASSWORD）"
                type="password"
                value={value().password ?? ""}
                onInput={(event) => setDraft({ ...value(), password: event.currentTarget.value })}
              />
              <div class="flex justify-end gap-2">
                <button class="flex h-8 w-8 items-center justify-center rounded text-[var(--set-text-muted)] hover:bg-[var(--set-hover)]" title="取消" onClick={() => setDraft(null)}>
                  <X size={15} />
                </button>
                <button class={PRIMARY_BTN_CLASS} disabled={busy()} onClick={() => void saveDraft()}>
                  {busy() ? "验证中…" : "保存并连接"}
                </button>
              </div>
            </div>
          </Section>
        )}
      </Show>
    </div>
  )
}
