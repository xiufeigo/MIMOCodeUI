import { createSignal, For, Show, type Component } from "solid-js"
import { Braces, ChevronDown, HardDrive, Server } from "lucide-solid"
import { DirectoryPicker, ServerProfileIcon } from "../components/directory-picker"
import { PopoverSurface } from "../components/overlay/popover-surface"
import { PromptInput } from "../components/prompt/prompt-input"
import type { PromptModelOption, ReasoningEffort, ReasoningEffortOption } from "../components/prompt/types"
import { useApp } from "../lib/store/provider"
import type { AgentInfo } from "../lib/protocol/types"
import type { PromptPart } from "../lib/attachment"

interface NewTaskWelcomeProps {
  agents: AgentInfo[]
  models: PromptModelOption[]
  agent?: string
  model?: string
  reasoningEffort?: ReasoningEffort
  /** 思考强度选项（由当前模型 variants 生成；缺省回退五档）。 */
  effortOptions?: ReasoningEffortOption[]
  /** 外部（如左栏“在目录中新建”）预填的目录；组件首次挂载时应用一次。 */
  initialDirectory?: string
  pending: boolean
  onAgentChange: (agent: string | undefined) => void
  onModelChange: (model: string | undefined) => void
  onReasoningEffortChange: (effort: ReasoningEffort) => void
  onSubmit: (request: { text: string; directory?: string; profileID: string; agent?: string; model?: string; variant?: string; parts?: PromptPart[] }) => Promise<void>
}

/** 唯一允许同时打开的新建任务下拉。 */
export type NewTaskPopover = "server" | "directory" | null

/** 默认工作台：撑满中间区域的大卡片，样式与会话页一致。 */
export const NewTaskWelcome: Component<NewTaskWelcomeProps> = (p) => {
  const { profiles, activeProfile } = useApp()
  const [profileID, setProfileID] = createSignal(activeProfile().id)
  const [directory, setDirectory] = createSignal<string | undefined>()
  const [draft, setDraft] = createSignal("")
  const [activePopover, setActivePopover] = createSignal<NewTaskPopover>(null)
  const [serverMenuRef, setServerMenuRef] = createSignal<HTMLElement | null>(null)

  const profile = () => profiles().find((item) => item.id === profileID()) ?? activeProfile()

  function selectProfile(id: string) {
    setProfileID(id)
    setDirectory(undefined)
    setActivePopover(null)
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col p-2">
      <section
        class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)]"
        aria-labelledby="new-task-title"
      >
        <div class="flex min-h-0 flex-1 overflow-y-auto px-4">
          <div class="flex min-h-full w-full flex-col items-center justify-center py-8 sm:py-12">
            <div class="mb-6 flex flex-col items-center gap-2 text-center sm:mb-8">
            <div class="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--accent)]/15 text-[var(--accent)]">
              <Braces size={23} />
            </div>
            <h1 id="new-task-title" class="text-2xl font-semibold text-[var(--text-primary)]">Code with MIMO Code</h1>
            <p class="max-w-lg text-sm text-[var(--text-secondary)]">描述要完成的开发工作，MIMO Code 会从当前任务目录开始协作。</p>
          </div>

          <PromptInput
            class="w-full max-w-3xl"
            draft={draft()}
            disabled={p.pending}
            onDraftChange={setDraft}
            placeholder="帮你编写代码、调试 Bug、优化性能等开发工作…"
            agent={p.agent}
            model={p.model}
            reasoningEffort={p.reasoningEffort ?? "default"}
            effortOptions={p.effortOptions}
            agents={p.agents}
            models={p.models}
            onAgentChange={p.onAgentChange}
            onModelChange={p.onModelChange}
            onReasoningEffortChange={p.onReasoningEffortChange}
            onSubmitNewTask={(request) => p.onSubmit({ ...request, directory: directory(), profileID: profile().id })}
          />

          <div class="mt-4 flex w-full max-w-3xl min-w-0 flex-wrap items-center justify-start gap-1.5">
            <div class="relative min-w-0">
              <button
                ref={setServerMenuRef}
                class="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                aria-label="选择服务端"
                aria-expanded={activePopover() === "server"}
                disabled={p.pending}
                onClick={() => setActivePopover((current) => (current === "server" ? null : "server"))}
              >
                <ServerProfileIcon profile={profile()} />
                <span class="max-w-36 truncate">{profile().name}</span>
                <ChevronDown size={13} />
              </button>
              <PopoverSurface
                open={activePopover() === "server"}
                reference={serverMenuRef()}
                width={256}
                onClose={() => setActivePopover(null)}
              >
                <For each={profiles()}>
                  {(item) => (
                    <button
                      class={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--bg-hover)] ${item.id === profile().id ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}
                      onClick={() => selectProfile(item.id)}
                    >
                      {item.mode === "local" ? <HardDrive size={15} /> : <Server size={15} />}
                      <span class="min-w-0 flex-1 truncate">{item.name}</span>
                      <Show when={item.id === profile().id}><span class="text-xs">当前</span></Show>
                    </button>
                  )}
                </For>
              </PopoverSurface>
            </div>
            <DirectoryPicker
              profile={profile()}
              value={directory()}
              initialDirectory={p.initialDirectory}
              open={activePopover() === "directory"}
              disabled={p.pending}
              onOpenChange={(open) => setActivePopover(open ? "directory" : null)}
              onChange={setDirectory}
            />
            <Show when={p.pending}>
              <span class="ml-auto text-xs text-[var(--text-muted)]">正在创建任务…</span>
            </Show>
          </div>
          </div>
        </div>
      </section>
    </div>
  )
}
