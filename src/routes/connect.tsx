import { createSignal, Show } from "solid-js"
import { useApp } from "../lib/store/provider"

export interface UnconnectedViewProps {
  onOpenSettings: () => void
}

/**
 * Embedded empty state shown inside the workspace while disconnected.
 * The real connection configuration lives in the settings dialog.
 * 安卓版没有本地 serve：直接展示云端连接表单。
 */
export function UnconnectedView(props: UnconnectedViewProps) {
  const { connection, connectionError, connectLocal, connectExternal, platform, activeProfile, bridge } = useApp()
  const [busy, setBusy] = createSignal(false)
  const [localError, setLocalError] = createSignal<string | null>(null)
  const [remoteURL, setRemoteURL] = createSignal(activeProfile().mode === "remote" ? activeProfile().url ?? "" : "")
  const [remoteUsername, setRemoteUsername] = createSignal(
    activeProfile().mode === "remote" && activeProfile().username ? activeProfile().username! : "mimocode",
  )
  const [remotePassword, setRemotePassword] = createSignal(
    activeProfile().mode === "remote" ? activeProfile().password ?? "" : "",
  )

  const isAndroid = () => platform() === "android"

  const statusText = () => {
    const c = connection()
    switch (c.status) {
      case "connecting":
        return isAndroid() ? "正在连接云端服务器…" : "正在连接本地服务器…"
      case "error":
        return `连接失败：${c.message}`
      default:
        return ""
    }
  }

  const errorText = () => localError() ?? connectionError() ?? statusText()

  async function onLocal() {
    setBusy(true)
    setLocalError(null)
    try {
      await connectLocal()
    } catch (e) {
      setLocalError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onRemoteConnect() {
    const url = remoteURL().trim()
    if (!/^https?:\/\//.test(url)) {
      setLocalError("服务器地址需要以 http:// 或 https:// 开头")
      return
    }
    setBusy(true)
    setLocalError(null)
    try {
      await connectExternal(url, remoteUsername().trim() || "mimocode", remotePassword())
    } catch (e) {
      setLocalError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-8">
      <div class="flex flex-col items-center gap-2">
        <h1 class="text-2xl font-bold tracking-tight text-[var(--text-primary)]">MiMoCodeUI</h1>
        <p class="max-w-md text-center text-sm text-[var(--text-secondary)]">
          {isAndroid()
            ? "未连接服务器。输入远端 mimo serve 地址即可连接。"
            : "未连接服务器。启动本地服务，或在设置中选择远端服务器。"}
        </p>
      </div>

      <Show when={errorText()}>
        <p class="max-w-md text-center text-xs text-[var(--error)]">{errorText()}</p>
      </Show>

      <Show when={isAndroid()}>
        <form
          class="flex w-full max-w-sm flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void onRemoteConnect()
          }}
        >
          <input
            class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
            placeholder="服务器地址，如 https://mimo.example.com"
            value={remoteURL()}
            inputmode="url"
            autocomplete="url"
            onInput={(e) => setRemoteURL(e.currentTarget.value)}
          />
          <div class="flex gap-2">
            <input
              class="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
              placeholder="用户名"
              value={remoteUsername()}
              autocomplete="username"
              onInput={(e) => setRemoteUsername(e.currentTarget.value)}
            />
            <input
              class="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
              placeholder="密码"
              type="password"
              value={remotePassword()}
              autocomplete="current-password"
              onInput={(e) => setRemotePassword(e.currentTarget.value)}
            />
          </div>
          <button
            class="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            disabled={busy() || connection().status === "connecting" || !remoteURL().trim()}
            type="submit"
          >
            {busy() ? "连接中…" : "连接云端服务器"}
          </button>
        </form>
      </Show>

      <div class="flex flex-wrap justify-center gap-3">
        <Show when={!isAndroid() && bridge().isTauri()}>
          <button
            class="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)] disabled:opacity-50"
            disabled={busy() || connection().status === "connecting"}
            onClick={onLocal}
          >
            {busy() ? "启动中…" : "启动本地服务器"}
          </button>
        </Show>
        <button
          class="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
          onClick={props.onOpenSettings}
        >
          连接设置
        </button>
      </div>
    </div>
  )
}
