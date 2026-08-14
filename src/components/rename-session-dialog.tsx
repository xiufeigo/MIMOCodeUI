import { createEffect, createSignal, type Component } from "solid-js"
import { ModalDialog } from "./overlay/modal-dialog"

interface RenameSessionDialogProps {
  open: boolean
  title: string
  onConfirm: (title: string) => void
  onClose: () => void
}

/** 本机会话标题重命名弹框。 */
export const RenameSessionDialog: Component<RenameSessionDialogProps> = (p) => {
  const [value, setValue] = createSignal("")
  let inputEl: HTMLInputElement | undefined

  createEffect(() => {
    if (!p.open) return
    setValue(p.title)
    queueMicrotask(() => {
      inputEl?.focus()
      inputEl?.select()
    })
  })

  function submit(event: SubmitEvent) {
    event.preventDefault()
    const next = value().trim()
    if (!next) return
    p.onConfirm(next)
    p.onClose()
  }

  return (
    <ModalDialog open={p.open} title="重命名任务" onClose={p.onClose} class="w-full max-w-sm">
      <form class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-4 shadow-2xl" onSubmit={submit}>
        <h2 class="mb-3 text-sm font-medium text-[var(--text-primary)]">重命名任务</h2>
        <input
          ref={inputEl}
          class="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          value={value()}
          onInput={(event) => setValue(event.currentTarget.value)}
        />
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            type="button"
            onClick={() => p.onClose()}
          >
            取消
          </button>
          <button class="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90" type="submit">
            保存
          </button>
        </div>
      </form>
    </ModalDialog>
  )
}
