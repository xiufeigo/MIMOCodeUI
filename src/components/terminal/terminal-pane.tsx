import { createSignal, onCleanup, onMount, Show, type Component } from "solid-js"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { useApp, useClient } from "../../lib/store/provider"
import { createPty, getPtyToken, ptyWebSocketUrl } from "../../lib/protocol/pty"
import type { ServerConnection } from "../../lib/protocol/client"

import "@xterm/xterm/css/xterm.css"

export interface TerminalPaneProps {
  sessionID: string
}

/**
 * PTY terminal tab.
 *
 * MiMo PTY protocol (verified against @mimo-ai/cli 0.1.11 source):
 * - WebSocket `/pty/:id/connect?ticket=` carries RAW bytes: client sends
 *   terminal input as-is (string/binary), server streams output as binary.
 * - The server sends one control frame first: 0x00 + UTF-8 JSON {"cursor":n}.
 * - Resize goes over REST `PATCH /pty/:id` with { size: { cols, rows } }.
 */
export const TerminalPane: Component<TerminalPaneProps> = (p) => {
  const { store } = useApp()
  const client = useClient()
  const [status, setStatus] = createSignal<"connecting" | "open" | "closed" | "error">("connecting")
  const [error, setError] = createSignal<string | null>(null)

  let container: HTMLDivElement | undefined
  let ws: WebSocket | null = null
  let term: Terminal | null = null
  let fit: FitAddon | null = null
  let conn: ServerConnection | null = null
  let ptyID: string | null = null

  async function resizeTerminal(cols: number, rows: number) {
    if (!conn || !ptyID) return
    try {
      await fetch(`${conn.baseUrl}/pty/${ptyID}`, {
        method: "PATCH",
        headers: {
          Authorization: `Basic ${btoa(`${conn.username}:${conn.password}`)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ size: { cols, rows } }),
      })
    } catch (e) {
      console.error("pty resize failed", e)
    }
  }

  onMount(async () => {
    const c = client()
    if (!c) return
    conn = c.conn

    try {
      const pty = await createPty(conn, {
        cols: 100,
        rows: 30,
        cwd: store.store.sessions[p.sessionID]?.directory,
      })
      ptyID = pty.id
      const token = await getPtyToken(conn, pty.id)
      const ticket = token.ticket ?? token.token
      if (!ticket) throw new Error("未获取到 PTY ticket")

      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "Consolas, 'Courier New', monospace",
        theme: { background: "#0a0a0a", foreground: "#e5e5e5" },
      })
      fit = new FitAddon()
      term.loadAddon(fit)
      if (container) term.open(container)
      fit.fit()

      ws = new WebSocket(ptyWebSocketUrl(conn.baseUrl, pty.id, ticket))
      ws.binaryType = "arraybuffer"

      ws.onopen = () => {
        setStatus("open")
        void resizeTerminal(term!.cols, term!.rows)
      }

      ws.onmessage = (ev) => {
        const data = ev.data
        if (typeof data === "string") {
          term?.write(data)
          return
        }
        // Binary frame: first byte 0 marks a control frame (JSON metadata),
        // anything else is raw PTY output.
        const bytes = new Uint8Array(data as ArrayBuffer)
        if (bytes.length > 0 && bytes[0] === 0) {
          // control frame: 0x00 + JSON, e.g. {"cursor":n}
          try {
            const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(1)))
            void meta
          } catch {
            /* ignore malformed control frame */
          }
          return
        }
        term?.write(bytes)
      }

      ws.onclose = () => setStatus("closed")
      ws.onerror = () => setStatus("error")

      term.onData((data) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(data)
      })

      const onResize = () => {
        if (fit && term) {
          fit.fit()
          void resizeTerminal(term.cols, term.rows)
        }
      }
      window.addEventListener("resize", onResize)
      onCleanup(() => window.removeEventListener("resize", onResize))
    } catch (e) {
      setStatus("error")
      setError((e as Error).message)
    }
  })

  onCleanup(() => {
    ws?.close()
    term?.dispose()
  })

  return (
    <div class="flex min-h-0 flex-1 flex-col bg-[var(--bg-app)]">
      <div class="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-color)] px-3">
        <span
          class={`h-2 w-2 rounded-full ${
            status() === "open" ? "bg-[var(--success)]" : status() === "error" ? "bg-[var(--error)]" : "bg-[var(--border-strong)]"
          }`}
        />
        <span class="text-xs text-[var(--text-secondary)]">
          {status() === "connecting"
            ? "连接中…"
            : status() === "open"
              ? "终端已连接"
              : status() === "closed"
                ? "终端已关闭"
                : "连接失败"}
        </span>
      </div>
      <div ref={container} class="min-h-0 flex-1 overflow-hidden p-2" />
      <Show when={error()}>
        <p class="border-t border-[var(--border-color)] px-4 py-2 text-xs text-[var(--error)]">{error()}</p>
      </Show>
    </div>
  )
}
