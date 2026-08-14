import { createMemo, For, Show, type Component } from "solid-js"
import { parseUnifiedDiff } from "../../lib/diff/unified"

export interface DiffViewProps {
  /** Unified diff text */
  diff: string
  /** Optional compact mode: only render stat lines (+n/-m) */
  compact?: boolean
}

/**
 * Unified diff viewer with syntax-ish coloring (no external highlighter).
 * Split-style: removed lines and added lines are aligned side by side.
 */
export const DiffView: Component<DiffViewProps> = (p) => {
  const files = createMemo(() => parseUnifiedDiff(p.diff))

  const stats = createMemo(() => {
    let adds = 0
    let dels = 0
    for (const f of files()) {
      adds += f.additions
      dels += f.deletions
    }
    return { adds, dels }
  })

  return (
    <div class="overflow-hidden rounded-md border border-[var(--border-color)]">
      <div class="flex items-center gap-2 border-b border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs">
        <span class="text-[var(--diff-add)]">+{stats().adds}</span>
        <span class="text-[var(--diff-delete)]">-{stats().dels}</span>
        <Show when={!p.compact}>
          <span class="ml-1 text-[var(--text-muted)]">{files().length > 0 ? files().map((f) => f.newName || f.oldName).join(", ") : "无文件头"}</span>
        </Show>
      </div>
      <Show when={!p.compact} fallback={null}>
        <For each={files()}>
          {(file) => (
            <div class="border-b border-[var(--border-color)] last:border-b-0">
              <Show when={file.newName && file.oldName !== file.newName}>
                <div class="bg-[var(--bg-surface)] px-3 py-1 font-mono text-xs text-[var(--text-muted)]">
                  {file.oldName && file.oldName !== file.newName ? `${file.oldName} → ` : ""}
                  {file.newName}
                </div>
              </Show>
              <div class="overflow-x-auto font-mono text-xs leading-5">
                <For each={file.lines}>
                  {(line) => (
                    <div
                      class={`flex whitespace-pre px-3 ${
                        line.type === "add"
                          ? "bg-[var(--diff-add)]/10 text-[var(--diff-add)]"
                          : line.type === "remove"
                            ? "bg-[var(--diff-delete)]/10 text-[var(--diff-delete)]"
                            : line.type === "meta"
                              ? "bg-[var(--bg-surface)] text-[var(--text-muted)]"
                              : "text-[var(--text-secondary)]"
                      }`}
                    >
                      <span class="mr-3 w-4 shrink-0 select-none text-[var(--text-muted)]">
                        {line.type === "add" ? "+" : line.type === "remove" ? "-" : ""}
                      </span>
                      <span class="whitespace-pre">{line.text || " "}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
        <Show when={files().length === 0 && p.diff.trim()}>
          <pre class="max-h-64 overflow-auto whitespace-pre-wrap bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-muted)]">
            {p.diff}
          </pre>
        </Show>
      </Show>
    </div>
  )
}

export interface DiffStatsProps {
  diff: string
}

/** Just the +/- counters for collapsed tool rows. */
export const DiffStats: Component<DiffStatsProps> = (p) => {
  const files = createMemo(() => parseUnifiedDiff(p.diff))
  const stats = createMemo(() => {
    let adds = 0
    let dels = 0
    for (const f of files()) {
      adds += f.additions
      dels += f.deletions
    }
    return { adds, dels }
  })
  return (
    <span class="text-xs">
      <span class="text-[var(--diff-add)]">+{stats().adds}</span>{" "}
      <span class="text-[var(--diff-delete)]">-{stats().dels}</span>
    </span>
  )
}
