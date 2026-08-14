import { useSettings } from "../../lib/settings/store"
import { THEMES } from "../../lib/theme/themes"
import { Row, Section, Select, Toggle } from "./ui"
import { FontPicker } from "./font-picker"

const SOUND_OPTIONS = [
  { value: "none", label: "无" },
  { value: "default", label: "默认" },
  { value: "crisp", label: "清脆" },
  { value: "soft", label: "柔和" },
]

/**
 * General tab (OpenCode-compatible): Appearance (color scheme / theme /
 * fonts), General toggles, Notifications, Advanced (desktop) toggles.
 * Shell is not shown: MiMo config has no `shell` key (verified against
 * packages/opencode/src/config/config.ts).
 */
export function SettingsGeneral() {
  const { settings, set, setFont, setFontSize, setNotification, setSound, setAutoAccept, setAdvanced } = useSettings()
  const s = () => settings()

  return (
    <div>
      <Section title="外观">
        <Row title="配色方案" description="跟随系统 / 浅色 / 深色">
          <Select
            value={s().colorScheme}
            onChange={(v) => set("colorScheme", v as "system" | "light" | "dark")}
            options={[
              { value: "system", label: "跟随系统" },
              { value: "light", label: "浅色" },
              { value: "dark", label: "深色" },
            ]}
          />
        </Row>
        <Row title="语言" description="界面显示语言">
          <Select
            value={s().language}
            onChange={(v) => set("language", v)}
            options={[{ value: "zh-CN", label: "简体中文" }]}
          />
        </Row>
        <Row title="主题" description="OpenCode 主题集（37 个）">
          <Select
            value={s().themeId}
            onChange={(v) => set("themeId", v)}
            options={THEMES.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Row>
        <Row title="界面字号" description="全局界面字号（12–20px）">
          <input
            type="number"
            min={12}
            max={20}
            step={1}
            class="w-20 rounded-md border border-[var(--set-border-soft)] bg-[var(--set-input-bg)] px-2 py-1 text-sm text-[var(--set-text)] outline-none hover:border-[var(--set-accent-soft)] focus:border-[var(--accent)]"
            value={s().fonts.fontSize}
            onInput={(e) => {
              const n = Number(e.currentTarget.value)
              if (Number.isFinite(n)) setFontSize(Math.min(20, Math.max(12, n)))
            }}
          />
        </Row>
        <Row title="界面字体" description="留空使用系统默认">
          <FontPicker value={s().fonts.sans} placeholder="系统默认" onChange={(v) => setFont("sans", v)} />
        </Row>
        <Row title="代码字体" description="Markdown 代码块字体">
          <FontPicker value={s().fonts.mono} placeholder="系统默认" onChange={(v) => setFont("mono", v)} />
        </Row>
        <Row title="终端字体" description="PTY 终端字体">
          <FontPicker value={s().fonts.terminal} placeholder="系统默认" onChange={(v) => setFont("terminal", v)} />
        </Row>
      </Section>

      <Section title="通用">
        <Row title="推理摘要" description="折叠显示思考过程摘要">
          <Toggle checked={s().reasoningSummaries} onChange={(v) => set("reasoningSummaries", v)} />
        </Row>
        <Row title="自动接受权限" description="权限请求自动以「始终允许」通过">
          <Toggle checked={s().permissions.autoAccept} onChange={(v) => setAutoAccept(v)} />
        </Row>
        <Row title="Shell 工具默认展开" description="新消息中的 Shell 工具卡片默认展开">
          <Toggle checked={s().shellToolPartsExpanded} onChange={(v) => set("shellToolPartsExpanded", v)} />
        </Row>
        <Row title="编辑工具默认展开" description="新消息中的编辑/差异工具卡片默认展开">
          <Toggle checked={s().editToolPartsExpanded} onChange={(v) => set("editToolPartsExpanded", v)} />
        </Row>
      </Section>

      <Section title="通知">
        <Row title="Agent">
          <Toggle checked={s().notifications.agent} onChange={(v) => setNotification("agent", v)} />
        </Row>
        <Row title="权限请求">
          <Toggle checked={s().notifications.permissions} onChange={(v) => setNotification("permissions", v)} />
        </Row>
        <Row title="错误">
          <Toggle checked={s().notifications.errors} onChange={(v) => setNotification("errors", v)} />
        </Row>
      </Section>

      <Section title="提示音">
        <Row title="Agent 提示音">
          <Select value={s().sounds.agent} onChange={(v) => setSound("agent", v)} options={SOUND_OPTIONS} />
        </Row>
        <Row title="权限请求提示音">
          <Select value={s().sounds.permissions} onChange={(v) => setSound("permissions", v)} options={SOUND_OPTIONS} />
        </Row>
        <Row title="错误提示音">
          <Select value={s().sounds.errors} onChange={(v) => setSound("errors", v)} options={SOUND_OPTIONS} />
        </Row>
      </Section>

      <Section title="高级">
        <Row title="显示文件树">
          <Toggle checked={s().advanced.showFileTree} onChange={(v) => setAdvanced("showFileTree", v)} />
        </Row>
        <Row title="显示导航">
          <Toggle checked={s().advanced.showNavigation} onChange={(v) => setAdvanced("showNavigation", v)} />
        </Row>
        <Row title="显示搜索">
          <Toggle checked={s().advanced.showSearch} onChange={(v) => setAdvanced("showSearch", v)} />
        </Row>
        <Row title="显示状态">
          <Toggle checked={s().advanced.showStatus} onChange={(v) => setAdvanced("showStatus", v)} />
        </Row>
        <Row title="显示自定义 Agent">
          <Toggle checked={s().advanced.showCustomAgents} onChange={(v) => setAdvanced("showCustomAgents", v)} />
        </Row>
      </Section>
    </div>
  )
}

