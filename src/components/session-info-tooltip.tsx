import { Show, type Component } from "solid-js"
import { useApp } from "../lib/store/provider"
import { useSessionPreferences } from "../lib/session-preferences"
import { Server, FolderOpen, Clock } from "lucide-solid"

interface SessionInfoTooltipProps {
  sessionID: string | null
  visible: boolean
}

/**
 * 会话信息悬浮提示（Trae 风格）：鼠标悬停中栏标题图标时展示
 * 标题、服务器、目录、更新时间。
 */
export const SessionInfoTooltip: Component<SessionInfoTooltipProps> = (p) => {
  const { store, savedConnection } = useApp()
  const { displayTitle } = useSessionPreferences()

  const session = () => (p.sessionID ? store.store.sessions[p.sessionID] : undefined)
  const serverLabel = () => {
    const cfg = savedConnection()
    if (cfg?.mode === "remote") return cfg.url ?? "远程连接"
    return "本地服务"
  }
  const directory = () => session()?.directory || "—"
  const updated = () => {
    const t = session()?.time?.updated
    return t ? new Date(t).toLocaleString() : "—"
  }

  return (
    <Show when={p.visible && p.sessionID}>
      <div
        class="pointer-events-none absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-3 shadow-xl"
      >
        <p class="mb-2 truncate text-sm font-medium text-[var(--text-primary)]">
          {p.sessionID ? displayTitle(p.sessionID, session()?.title) : "无标题会话"}
        </p>
        <div class="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)]">
          <div class="flex items-center gap-2">
            <Server size={13} class="shrink-0 text-[var(--text-muted)]" />
            <span class="truncate">{serverLabel()}</span>
          </div>
          <div class="flex items-center gap-2">
            <FolderOpen size={13} class="shrink-0 text-[var(--text-muted)]" />
            <span class="truncate">{directory()}</span>
          </div>
          <div class="flex items-center gap-2">
            <Clock size={13} class="shrink-0 text-[var(--text-muted)]" />
            <span>更新于 {updated()}</span>
          </div>
        </div>
      </div>
    </Show>
  )
}
