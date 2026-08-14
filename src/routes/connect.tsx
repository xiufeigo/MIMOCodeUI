import { createSignal, Show } from "solid-js"
import { useApp } from "../lib/store/provider"

export interface UnconnectedViewProps {
  onOpenSettings: () => void
}

/**
 * Embedded empty state shown inside the workspace while disconnected.
 * The real connection configuration lives in the settings dialog.
 */
export function UnconnectedView(props: UnconnectedViewProps) {
  const { connection, connectionError, connectLocal, bridge } = useApp()
  const [busy, setBusy] = createSignal(false)
  const [localError, setLocalError] = createSignal<string | null>(null)

  const statusText = () => {
    const c = connection()
    switch (c.status) {
      case "connecting":
        return "正在连接本地服务器…"
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

  return (
    <div class="flex flex-1 flex-col items-center justify-center gap-5 px-6">
      <div class="flex flex-col items-center gap-2">
        <h1 class="text-2xl font-bold tracking-tight text-[var(--text-primary)]">MIMO Code UI</h1>
        <p class="max-w-md text-center text-sm text-[var(--text-secondary)]">
          未连接服务器。启动本地服务，或在设置中选择远端服务器。
        </p>
      </div>

      <Show when={errorText()}>
        <p class="max-w-md text-center text-xs text-[var(--error)]">{errorText()}</p>
      </Show>

      <div class="flex gap-3">
        <Show when={bridge().isTauri()}>
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
