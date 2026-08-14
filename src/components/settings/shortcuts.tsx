import { For, Show, type Component } from "solid-js"
import { useSettings } from "../../lib/settings/store"
import { Row, Section } from "./ui"

/** Commands that can be bound to keyboard shortcuts. */
export const SHORTCUT_COMMANDS: { id: string; label: string; default: string }[] = [
  { id: "settings.open", label: "打开设置", default: "Ctrl+," },
  { id: "session.new", label: "新建会话", default: "Ctrl+N" },
  { id: "session.switch", label: "切换会话", default: "Ctrl+O" },
  { id: "tab.chat", label: "切换到会话视图", default: "Ctrl+1" },
  { id: "tab.files", label: "切换到文件视图", default: "Ctrl+2" },
  { id: "tab.terminal", label: "切换到终端视图", default: "Ctrl+3" },
  { id: "prompt.focus", label: "聚焦输入框", default: "Ctrl+L" },
  { id: "prompt.send", label: "发送消息", default: "Enter" },
  { id: "prompt.stop", label: "停止运行", default: "Escape" },
  { id: "session.delete", label: "删除会话", default: "" },
  { id: "connection.disconnect", label: "断开连接", default: "" },
]

export interface SettingsShortcutsProps {
  /** Fire a bound command. (Reserved; commands fire globally in the workspace.) */
  onCommand?: (command: string) => void
}

/**
 * Shortcuts tab: bind keyboard combos to commands. Simplified from OpenCode's
 * record-on-click: type the combo into a text input ("Ctrl+K" style), clear
 * with the ✕ button. Persisted to localStorage.
 */
export const SettingsShortcuts: Component<SettingsShortcutsProps> = () => {
  const { settings, setKeybind, clearKeybind } = useSettings()

  return (
    <div>
      <Section title="快捷键">
        <For each={SHORTCUT_COMMANDS}>
          {(cmd) => {
            const bound = () => settings().keybinds[cmd.id] ?? cmd.default
            return (
              <Row title={cmd.label} description={cmd.id}>
                <div class="flex items-center gap-1.5">
                  <input
                    class="w-32 rounded-md border border-[var(--set-border-soft)] bg-[var(--set-input-bg)] px-2 py-1 font-mono text-xs text-[var(--set-text)] outline-none placeholder:text-neutral-400 hover:border-[var(--set-accent-soft)] focus:border-[var(--accent)]"
                    value={bound()}
                    placeholder="Ctrl+K"
                    onKeyDown={(e) => {
                      e.preventDefault()
                      const parts: string[] = []
                      if (e.ctrlKey) parts.push("Ctrl")
                      if (e.altKey) parts.push("Alt")
                      if (e.shiftKey) parts.push("Shift")
                      if (e.metaKey) parts.push("Meta")
                      const key = e.key === " " ? "Space" : e.key
                      if (!["Control", "Alt", "Shift", "Meta"].includes(key)) parts.push(key)
                      if (parts.length > 0) setKeybind(cmd.id, parts.join("+"))
                    }}
                    onInput={(e) => setKeybind(cmd.id, e.currentTarget.value)}
                  />
                  <Show when={bound() !== ""}>
                    <button
                      class="text-[var(--set-text-muted)] hover:text-red-500"
                      title="清除键位"
                      onClick={() => clearKeybind(cmd.id)}
                    >
                      ✕
                    </button>
                  </Show>
                </div>
              </Row>
            )
          }}
        </For>
      </Section>
      <p class="text-xs text-[var(--set-text-muted)]">在输入框中直接按组合键即可录制；✕ 清除；留空表示未绑定。</p>
    </div>
  )
}
