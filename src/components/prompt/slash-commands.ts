/** 输入框 `/` 快捷指令清单（仿 OpenCode TUI）。MiMo 后端无 `/command` 列表接口，故用内置清单。 */

export interface SlashCommand {
  /** 完整命令文本，含前导 `/`，如 "/agent"。 */
  command: string
  /** 用于匹配的名称（不含 `/`）。 */
  name: string
  /** 插入到输入框的文本（通常为命令名 + 尾随空格）。 */
  insert: string
  description: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: "/agent", name: "agent", insert: "/agent ", description: "选择 Agent" },
  { command: "/model", name: "model", insert: "/model ", description: "选择模型" },
  { command: "/new", name: "new", insert: "/new ", description: "新建会话" },
  { command: "/clear", name: "clear", insert: "/clear ", description: "清空当前会话" },
  { command: "/compact", name: "compact", insert: "/compact ", description: "压缩上下文" },
  { command: "/share", name: "share", insert: "/share ", description: "分享会话" },
  { command: "/diff", name: "diff", insert: "/diff ", description: "查看文件变更" },
  { command: "/apply", name: "apply", insert: "/apply ", description: "应用补丁" },
  { command: "/read", name: "read", insert: "/read ", description: "读取文件" },
  { command: "/edit", name: "edit", insert: "/edit ", description: "编辑文件" },
  { command: "/write", name: "write", insert: "/write ", description: "写入文件" },
  { command: "/glob", name: "glob", insert: "/glob ", description: "按模式查找文件" },
  { command: "/grep", name: "grep", insert: "/grep ", description: "搜索文件内容" },
  { command: "/webfetch", name: "webfetch", insert: "/webfetch ", description: "抓取网页" },
  { command: "/websearch", name: "websearch", insert: "/websearch ", description: "网页搜索" },
  { command: "/todo", name: "todo", insert: "/todo ", description: "写入待办" },
  { command: "/plan", name: "plan", insert: "/plan ", description: "进入计划模式" },
  { command: "/help", name: "help", insert: "/help ", description: "查看帮助" },
  { command: "/exit", name: "exit", insert: "/exit ", description: "退出" },
]

/** 按查询词过滤命令（匹配名称或描述）。 */
export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
  )
}

/**
 * 识别光标前的活动斜杠：`/` 需位于行首或空白之后，且其后到光标之间无空白。
 * 返回斜杠下标与查询词；无有效斜杠（含已输入空格结束命令、URL 内的 `/`）返回 null。
 */
export function activeSlash(value: string, cursor: number): { start: number; query: string } | null {
  let slash = -1
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = value[i]
    if (ch === "/") {
      if (i === 0 || /\s/.test(value[i - 1])) {
        slash = i
        break
      }
      return null
    }
    if (ch === "\n") return null
  }
  if (slash < 0) return null
  for (let i = slash + 1; i < cursor; i++) {
    if (/\s/.test(value[i])) return null
  }
  return { start: slash, query: value.slice(slash + 1, cursor) }
}
