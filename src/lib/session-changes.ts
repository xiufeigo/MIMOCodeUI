// 会话内文件变更的聚合逻辑。
//
// 原本内联在 components/right-panel/review.tsx 里，信息栏的「变更」也需要同一份
// 统计，故抽到此处共享。保持纯函数、无 Solid 依赖，便于单测。

import type { MessagePart, ToolPart } from "./protocol/types"

/** 视为「产生文件变更」的工具名。 */
export const CHANGE_TOOLS = ["edit", "apply_patch", "write"] as const

export interface FileChange {
  file: string
  tool: string
  adds: number
  dels: number
  diff: string
  added: boolean
}

/** 统计 unified diff 的 +/- 行数（排除 --- / +++ 文件头）。 */
export function countDiff(diff: string): { adds: number; dels: number } {
  let adds = 0
  let dels = 0
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) adds++
    else if (line.startsWith("-") && !line.startsWith("---")) dels++
  }
  return { adds, dels }
}

/** 从工具 part 的输出中提取 diff 文本（各工具字段命名不统一，逐个兜底）。 */
export function extractDiff(part: ToolPart): string {
  const st = part.state
  const out = st?.output
  const candidates: unknown[] = [out]
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>
    candidates.push(o.content, o.result, o.output, o.patch, o.diff)
    if (typeof o.diff === "object" && o.diff !== null) {
      candidates.push((o.diff as Record<string, unknown>).content)
    }
  }
  for (const c of candidates) {
    if (
      typeof c === "string" &&
      (c.includes("\n+") || c.includes("\n-") || c.startsWith("+") || c.startsWith("-"))
    ) {
      return c
    }
  }
  return ""
}

export function filePathOf(part: ToolPart): string {
  const meta = (part.state?.metadata ?? {}) as Record<string, unknown>
  const input = (part.state?.input ?? {}) as Record<string, unknown>
  return String(meta.file_path ?? meta.filePath ?? input.file_path ?? input.path ?? part.tool ?? "")
}

export function isChangeTool(part: MessagePart): part is ToolPart {
  if (part.type !== "tool") return false
  return (CHANGE_TOOLS as readonly string[]).includes((part as ToolPart).tool)
}

interface SessionMessageLike {
  parts: MessagePart[]
}

/** 按文件聚合变更；同一文件多次编辑累加行数，保留最后一次非空 diff。 */
export function collectFileChanges(
  messages: readonly SessionMessageLike[],
): FileChange[] {
  const map = new Map<string, FileChange>()
  for (const m of messages) {
    for (const part of m.parts) {
      if (!isChangeTool(part)) continue
      const tp = part as ToolPart
      const diff = extractDiff(tp)
      const file = filePathOf(tp) || "未命名"
      const { adds, dels } = countDiff(diff)
      const cur = map.get(file)
      if (cur) {
        cur.adds += adds
        cur.dels += dels
        if (diff) cur.diff = diff
      } else {
        map.set(file, {
          file,
          tool: tp.tool,
          adds,
          dels,
          diff,
          added: tp.tool === "write" || dels === 0,
        })
      }
    }
  }
  return Array.from(map.values())
}

/** 变更总数统计（信息栏「变更 +N -M」用）。 */
export interface ChangeSummary {
  files: number
  adds: number
  dels: number
}

export function summarizeChanges(changes: readonly FileChange[]): ChangeSummary {
  let adds = 0
  let dels = 0
  for (const c of changes) {
    adds += c.adds
    dels += c.dels
  }
  return { files: changes.length, adds, dels }
}
