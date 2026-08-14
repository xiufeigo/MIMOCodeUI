import { createSignal, Show, For, type Component } from "solid-js"
import { useApp, useClient } from "../../lib/store/provider"
import type { QuestionRequest } from "../../lib/protocol/types"

/**
 * Question overlay: MiMo asks yes/no or multiple-choice questions (e.g. the
 * plan_exit approval: "switch to build agent?"). Reply or reject.
 */
export const QuestionPrompt: Component<{ sessionID: string }> = (p) => {
  const { store } = useApp()
  const client = useClient()
  const [answers, setAnswers] = createSignal<Record<string, string[]>>({})

  const pending = () => store.store.questions[p.sessionID] ?? []

  async function reply(req: QuestionRequest, picked: string[][]) {
    const c = client()
    if (!c) return
    try {
      await c.replyQuestion(req.id, picked)
    } catch (e) {
      console.error("question reply failed", e)
    }
  }

  async function reject(req: QuestionRequest) {
    const c = client()
    if (!c) return
    try {
      await c.rejectQuestion(req.id)
    } catch (e) {
      console.error("question reject failed", e)
    }
  }

  function isMultiple(question: QuestionRequest["questions"][number]) {
    return question.type === "multiple" || question.type === "multi-select" || question.type === "checkbox"
  }

  function complete(req: QuestionRequest) {
    return req.questions.every((_, index) => (answers()[`${req.id}:${index}`] ?? []).length > 0)
  }

  return (
    <Show when={pending().length > 0}>
      <div class="max-h-64 overflow-y-auto border-t border-[var(--border-color)] bg-[var(--bg-surface)]/80 px-4 py-3">
        <For each={pending()}>
          {(req) => (
            <div class="mx-auto flex max-w-3xl flex-col gap-2">
              <For each={req.questions}>
                {(q, qi) => {
                  const sel = () => answers()[`${req.id}:${qi()}`] ?? []
                  const pick = (v: string) => {
                    setAnswers((prev) => {
                      const cur = prev[`${req.id}:${qi()}`] ?? []
                      const next = isMultiple(q) ? (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]) : [v]
                      return { ...prev, [`${req.id}:${qi()}`]: next }
                    })
                  }
                  const inputType = () => (isMultiple(q) ? "checkbox" : "radio")
                  const inputName = `question-${req.id}-${qi()}`
                  return (
                    <div class="flex flex-col gap-1.5">
                      <p class="text-sm text-[var(--text-primary)]">
                        <span class="font-medium text-[var(--accent)]">提问</span>
                        <span class="ml-2">{q.question}</span>
                      </p>
                      <Show when={q.choices?.length}>
                        <div class="flex flex-wrap gap-2">
                          <For each={q.choices ?? []}>
                            {(choice) => (
                              <label
                                class={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                                  sel().includes(choice)
                                    ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
                                    : "border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                                }`}
                              >
                                <input
                                  class="sr-only"
                                  type={inputType()}
                                  name={inputName}
                                  checked={sel().includes(choice)}
                                  onChange={() => pick(choice)}
                                />
                                <span>{choice}</span>
                              </label>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )
                }}
              </For>
              <div class="flex gap-2">
                <button
                  class="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!complete(req)}
                  onClick={() => reply(req, req.questions.map((_, i) => answers()[`${req.id}:${i}`] ?? []))}
                >
                  提交回答
                </button>
                <button
                  class="rounded-md bg-[var(--error)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--error)]"
                  onClick={() => reject(req)}
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
