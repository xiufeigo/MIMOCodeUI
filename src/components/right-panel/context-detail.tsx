import { For, Show, type Component } from "solid-js"
import { useApp } from "../../lib/store/provider"

export interface ContextDetailProps {
  sessionID: string
}

/**
 * 上下文详情（OpenCode 官方样式）：两列指标网格 + 上下文细分进度条 +
 * 原始消息列表。数据从 store 的 messages / info.tokens / cost 派生。
 */
export const ContextDetail: Component<ContextDetailProps> = (p) => {
  const { store } = useApp()
  const messages = () => (p.sessionID ? store.sessionMessages(p.sessionID) : [])

  const lastAssistant = () => {
    for (const m of messages()) if (m.info?.role === "assistant") return m
    return null
  }

  const tokens = () => lastAssistant()?.info?.tokens
  const inputT = () => tokens()?.input ?? 0
  const outputT = () => tokens()?.output ?? 0
  const reasoningT = () => tokens()?.reasoning ?? 0
  const cacheRead = () => tokens()?.cache?.read ?? 0
  const cacheWrite = () => tokens()?.cache?.write ?? 0
  const total = () => tokens()?.total ?? inputT() + outputT()
  /** 动态读取当前会话模型的上下文窗口（未知时兜底 0）。 */
  const contextLimit = () => (p.sessionID ? store.contextLimit(p.sessionID) : 0)
  const usagePct = () => {
    const limit = contextLimit()
    if (limit <= 0) return 0
    return Math.min(100, Math.round((total() / limit) * 100))
  }
  const cost = () => lastAssistant()?.info?.cost ?? 0
  const provider = () => lastAssistant()?.info?.providerID ?? "—"
  const model = () => lastAssistant()?.info?.modelID ?? "—"

  const userMsgs = () => messages().filter((m) => m.info?.role === "user").length
  const assistantMsgs = () => messages().filter((m) => m.info?.role === "assistant").length

  // 上下文细分（按角色词元占比估算；工具调用从 part 数量近似）
  const breakdown = () => {
    let user = 0
    let assistant = 0
    let tool = 0
    for (const m of messages()) {
      const t = m.info?.tokens?.total ?? 0
      if (m.info?.role === "user") user += t || 1
      else {
        let toolParts = 0
        for (const part of m.parts) if (part.type === "tool") toolParts++
        tool += toolParts
        assistant += t
      }
    }
    const sum = user + assistant + tool || 1
    const pct = (v: number) => Math.round((v / sum) * 1000) / 10
    return [
      { label: "用户", pct: pct(user), color: "var(--success)" },
      { label: "助手", pct: pct(assistant), color: "var(--accent)" },
      { label: "工具调用", pct: pct(tool), color: "#a16207" },
      { label: "其他", pct: 0, color: "var(--border-strong)" },
    ]
  }

  const created = () => {
    const first = messages()[messages().length - 1]
    return first?.info?.time?.created
  }
  const lastActivity = () => messages()[0]?.info?.time?.created

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      {/* 指标网格 */}
      <div class="mb-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <Cell label="会话" value={store.store.sessions[p.sessionID]?.title ?? "—"} />
        <Cell label="消息数" value={String(messages().length)} />
        <Cell label="提供商" value={provider()} />
        <Cell label="模型" value={model()} />
        <Cell label="上下文限制" value={contextLimit().toLocaleString()} />
        <Cell label="词元总数" value={total().toLocaleString()} />
        <Cell label="使用率" value={`${usagePct()}%`} />
        <Cell label="输入词元" value={inputT().toLocaleString()} />
        <Cell label="输出词元" value={outputT().toLocaleString()} />
        <Cell label="推理词元" value={reasoningT().toLocaleString()} />
        <Cell label="缓存词元（读/写）" value={`${cacheRead().toLocaleString()} / ${cacheWrite().toLocaleString()}`} />
        <Cell label="用户消息" value={String(userMsgs())} />
        <Cell label="助手消息" value={String(assistantMsgs())} />
        <Cell label="总成本" value={`US$${(cost() ?? 0).toFixed(2)}`} />
        <Cell label="创建时间" value={created() ? fmt(created()!) : "—"} />
        <Cell label="最后活动" value={lastActivity() ? fmt(lastActivity()!) : "—"} />
      </div>

      {/* 上下文细分 */}
      <div class="mb-4">
        <p class="mb-2 text-xs text-[var(--text-muted)]">上下文细分</p>
        <div class="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-raised)]">
          <For each={breakdown()}>
            {(b) => (
              <Show when={b.pct > 0}>
                <div class="h-full" style={{ width: `${b.pct}%`, background: b.color }} />
              </Show>
            )}
          </For>
        </div>
        <div class="mt-1.5 flex flex-wrap gap-3">
          <For each={breakdown()}>
            {(b) => (
              <span class="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <span class="h-2 w-2 rounded-full" style={{ background: b.color }} />
                {b.label} {b.pct}%
              </span>
            )}
          </For>
        </div>
      </div>

      {/* 原始消息 */}
      <div>
        <p class="mb-2 text-xs text-[var(--text-muted)]">原始消息</p>
        <div class="flex flex-col gap-1">
          <For each={[...messages()].reverse()}>
            {(m) => (
              <div class="flex items-center justify-between rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 py-1 text-[10px]">
                <span class="text-[var(--text-secondary)]">
                  {m.info?.role} • {m.info?.id}
                </span>
                <span class="text-[var(--text-muted)]">{m.info?.time?.created ? fmt(m.info.time.created) : ""}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}

const Cell: Component<{ label: string; value: string }> = (p) => (
  <div>
    <p class="text-[10px] text-[var(--text-muted)]">{p.label}</p>
    <p class="truncate text-xs text-[var(--text-primary)]">{p.value}</p>
  </div>
)

function fmt(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`
}
