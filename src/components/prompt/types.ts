export interface PromptModelOption {
  providerID: string
  modelID: string
  providerName: string
  label: string
}

/**
 * 思考强度取值。优先使用模型 variants 的真实键（low/medium/high/max …）；
 * `default` 恒为服务端默认档。
 */
export type ReasoningEffort = "default" | (string & {})

export interface ReasoningEffortOption {
  value: string
  label: string
}

const EFFORT_ORDER = ["low", "medium", "high", "max"]
const EFFORT_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  max: "最高",
}

/**
 * 根据模型的 variants 生成思考强度选项列表：
 * - 恒含「默认」；
 * - variants 非空时按 low/medium/high/max 顺序取真实支持的档位（未知键原样显示）；
 * - variants 缺失/为空时回退五档：默认/低/中/高/最高。
 */
export function reasoningEffortOptions(variants?: Record<string, Record<string, unknown>>): ReasoningEffortOption[] {
  const keys = variants ? Object.keys(variants).filter((key) => key !== "default") : []
  const list =
    keys.length > 0
      ? keys.sort((a, b) => {
          const ia = EFFORT_ORDER.indexOf(a)
          const ib = EFFORT_ORDER.indexOf(b)
          return (ia === -1 ? EFFORT_ORDER.length : ia) - (ib === -1 ? EFFORT_ORDER.length : ib)
        })
      : ["low", "medium", "high", "max"]
  return [
    { value: "default", label: "默认" },
    ...list.map((key) => ({ value: key, label: EFFORT_LABELS[key] ?? key })),
  ]
}
