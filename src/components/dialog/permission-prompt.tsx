import { Show, For, type Component } from "solid-js"
import { useApp, useClient } from "../../lib/store/provider"
import type { PermissionRequest } from "../../lib/protocol/types"

/**
 * Permission approval overlay for the active session. Shows the most recent
 * pending request and lets the user reply once / always / reject.
 */
export const PermissionPrompt: Component<{ sessionID: string }> = (p) => {
  const { store } = useApp()
  const client = useClient()

  const pending = () => store.store.permissions[p.sessionID] ?? []

  async function reply(req: PermissionRequest, answer: "once" | "always" | "reject") {
    const c = client()
    if (!c) return
    try {
      await c.replyPermission(req.id, answer)
    } catch (e) {
      console.error("permission reply failed", e)
    }
  }

  return (
    <Show when={pending().length > 0}>
      <div class="max-h-64 overflow-y-auto border-t border-[var(--border-color)] bg-[var(--bg-surface)]/80 px-4 py-3">
        <For each={pending()}>
          {(req) => (
            <div class="mx-auto flex max-w-3xl flex-col gap-2">
              <p class="text-sm text-[var(--text-primary)]">
                <span class="font-medium text-[var(--warning)]">权限请求</span>
                <span class="ml-2 rounded bg-[var(--bg-raised)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)]">
                  {req.permission ?? req.action}
                </span>
              </p>
              <Show when={req.message}>
                <pre class="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                  {req.message}
                </pre>
              </Show>
              <Show when={req.patterns?.length}>
                <p class="font-mono text-xs text-[var(--text-muted)]">{req.patterns!.join(", ")}</p>
              </Show>
              <Show when={req.metadata?.filepath}>
                <p class="font-mono text-xs text-[var(--text-muted)]">{String(req.metadata!.filepath)}</p>
              </Show>
              <div class="flex gap-2">
                <button
                  class="rounded-md bg-[var(--success)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--success)]"
                  onClick={() => reply(req, "once")}
                >
                  允许一次
                </button>
                <button
                  class="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--accent)]"
                  onClick={() => reply(req, "always")}
                >
                  始终允许
                </button>
                <button
                  class="rounded-md bg-[var(--error)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--error)]"
                  onClick={() => reply(req, "reject")}
                >
                  拒绝
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}
