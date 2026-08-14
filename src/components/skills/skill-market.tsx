import { createEffect, createSignal, For, Show, type Component } from "solid-js"
import { useApp, useClient } from "../../lib/store/provider"
import type { GlobalConfig, SkillInfo } from "../../lib/protocol/types"

/**
 * 插件市场：管理 Skills。
 * - 展示全部技能（GET /skill，内置/用户来源标记 + 搜索）
 * - 管理额外技能源（config `skills.paths/urls`，PATCH /global/config）
 * 注：MiMo serve 无单个技能的增删接口，仅支持配置额外技能目录/URL 源。
 */
export const SkillMarket: Component = () => {
  const { connection } = useApp()
  const client = useClient()
  const [skills, setSkills] = createSignal<SkillInfo[]>([])
  const [config, setConfig] = createSignal<GlobalConfig | null>(null)
  const [query, setQuery] = createSignal("")
  const [pathInput, setPathInput] = createSignal("")
  const [urlInput, setUrlInput] = createSignal("")
  const [msg, setMsg] = createSignal<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = createSignal(false)

  const skillsConfig = () => {
    const s = config()?.skills as { paths?: string[]; urls?: string[] } | undefined
    return { paths: s?.paths ?? [], urls: s?.urls ?? [] }
  }

  async function load() {
    const c = client()
    if (!c || connection().status !== "connected") return
    try {
      const [sk, cfg] = await Promise.all([
        c.listSkills(),
        c.getGlobalConfig().catch(() => null),
      ])
      setSkills(sk)
      setConfig(cfg)
    } catch (e) {
      console.error("load skills failed", e)
    }
  }

  createEffect(() => {
    if (connection().status === "connected") void load()
  })

  const filtered = () => {
    const q = query().toLowerCase()
    if (!q) return skills()
    return skills().filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q))
  }

  async function addPath() {
    const c = client()
    const v = pathInput().trim()
    if (!c || !v) return
    setBusy(true)
    try {
      const cur = skillsConfig()
      if (!cur.paths.includes(v)) {
        const next = { ...(config()?.skills ?? {}), paths: [...cur.paths, v], urls: cur.urls }
        await c.patchGlobalConfig({ skills: next })
        setMsg({ ok: true, text: `已添加技能目录：${v}` })
        setPathInput("")
        await load()
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function addUrl() {
    const c = client()
    const v = urlInput().trim()
    if (!c || !v) return
    setBusy(true)
    try {
      const cur = skillsConfig()
      if (!cur.urls.includes(v)) {
        const next = { ...(config()?.skills ?? {}), paths: cur.paths, urls: [...cur.urls, v] }
        await c.patchGlobalConfig({ skills: next })
        setMsg({ ok: true, text: `已添加技能源：${v}` })
        setUrlInput("")
        await load()
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function removeSource(kind: "paths" | "urls", value: string) {
    const c = client()
    if (!c) return
    setBusy(true)
    try {
      const cur = skillsConfig()
      const next = {
        ...(config()?.skills ?? {}),
        paths: kind === "paths" ? cur.paths.filter((x) => x !== value) : cur.paths,
        urls: kind === "urls" ? cur.urls.filter((x) => x !== value) : cur.urls,
      }
      await c.patchGlobalConfig({ skills: next })
      setMsg({ ok: true, text: `已移除：${value}` })
      await load()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Show when={msg()}>
          <p class={`text-xs ${msg()!.ok ? "text-[var(--success)]" : "text-[var(--error)]"}`}>{msg()!.text}</p>
        </Show>

        {/* 技能源管理 */}
        <div class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-4">
          <h3 class="mb-2 text-sm font-semibold text-[var(--text-primary)]">技能源管理</h3>
          <p class="mb-3 text-xs text-[var(--text-muted)]">
            通过配置额外技能目录 / URL 源来扩展技能（写入 ~/.config/mimocode/mimocode.jsonc）。
            MiMo 服务端不提供单个技能的增删接口，内置技能随版本发布。
          </p>
          <div class="mb-2 flex flex-col gap-2">
            <Show when={skillsConfig().paths.length > 0}>
              <div class="flex flex-col gap-1">
                <span class="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">技能目录</span>
                <For each={skillsConfig().paths}>
                  {(p) => (
                    <div class="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 py-1 font-mono text-xs text-[var(--text-secondary)]">
                      <span class="min-w-0 flex-1 truncate">{p}</span>
                      <button class="text-[var(--text-muted)] hover:text-[var(--error)]" onClick={() => removeSource("paths", p)}>
                        ✕
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={skillsConfig().urls.length > 0}>
              <div class="flex flex-col gap-1">
                <span class="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">技能 URL 源</span>
                <For each={skillsConfig().urls}>
                  {(u) => (
                    <div class="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 py-1 font-mono text-xs text-[var(--text-secondary)]">
                      <span class="min-w-0 flex-1 truncate">{u}</span>
                      <button class="text-[var(--text-muted)] hover:text-[var(--error)]" onClick={() => removeSource("urls", u)}>
                        ✕
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={skillsConfig().paths.length === 0 && skillsConfig().urls.length === 0}>
              <p class="text-xs text-[var(--text-muted)]">暂无额外技能源，全部为内置技能。</p>
            </Show>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex gap-2">
              <input
                class="min-w-0 flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                placeholder="技能目录路径，如 C:\skills"
                value={pathInput()}
                onInput={(e) => setPathInput(e.currentTarget.value)}
              />
              <button
                class="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                disabled={busy() || !pathInput().trim()}
                onClick={addPath}
              >
                添加目录
              </button>
            </div>
            <div class="flex gap-2">
              <input
                class="min-w-0 flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                placeholder="技能 URL，如 https://example.com/.well-known/skills/"
                value={urlInput()}
                onInput={(e) => setUrlInput(e.currentTarget.value)}
              />
              <button
                class="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                disabled={busy() || !urlInput().trim()}
                onClick={addUrl}
              >
                添加 URL
              </button>
            </div>
          </div>
        </div>

        {/* 技能列表 */}
        <div class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 class="text-sm font-semibold text-[var(--text-primary)]">
              全部技能 <span class="font-normal text-[var(--text-muted)]">({filtered().length} / {skills().length})</span>
            </h3>
            <input
              class="w-52 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              placeholder="搜索技能…"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
          <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
            <For each={filtered()}>
              {(s) => (
                <div class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                  <div class="mb-1 flex items-center gap-2">
                    <span class="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{s.name}</span>
                    <span
                      class={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                        s.bundled ? "bg-[var(--bg-raised)] text-[var(--text-muted)]" : "bg-[var(--accent)]/15 text-[var(--accent)]"
                      }`}
                    >
                      {s.bundled ? "内置" : "用户"}
                    </span>
                  </div>
                  <p class="line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">{s.description}</p>
                  <Show when={s.location}>
                    <p class="mt-1 truncate font-mono text-[10px] text-[var(--text-muted)]">{s.location}</p>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <Show when={filtered().length === 0}>
            <p class="py-6 text-center text-sm text-[var(--text-muted)]">未找到匹配的技能。</p>
          </Show>
        </div>
      </div>
    </div>
  )
}
