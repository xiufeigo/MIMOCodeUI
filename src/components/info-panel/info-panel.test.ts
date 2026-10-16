// 信息栏的纯逻辑单测（不测渲染）。
// 覆盖 parseTodos 对 todo_write 各种 output 形态的解析：JSON 字符串、对象、
// 缺失 output、空数组，以及非任务类工具/非 tool part 的过滤。

import { describe, expect, it } from "vitest"
import type { MessagePart } from "../../lib/protocol/types"
import { parseTodos } from "./sections"

interface MessageLike {
  parts: MessagePart[]
}

/** 造一条只含指定 parts 的消息；字段命名与 protocol/types.ts 保持一致。 */
function message(...parts: unknown[]): MessageLike {
  return { parts: parts as MessagePart[] }
}

function todoPart(output: unknown, tool = "todo_write") {
  return {
    id: "prt_1",
    sessionID: "ses_1",
    messageID: "msg_1",
    type: "tool",
    tool,
    state: { status: "completed", output },
  }
}

describe("parseTodos — 任务清单解析", () => {
  it("无消息时返回空数组", () => {
    expect(parseTodos([])).toEqual([])
  })

  it("忽略非 tool part 与非 todo_write 工具", () => {
    const messages = [
      message(
        { id: "p1", type: "text", text: "先调研再实现" },
        todoPart({ todos: [{ content: "不该出现", status: "pending" }] }, "read"),
        todoPart({ todos: [{ content: "该出现", status: "pending" }] }, "bash"),
      ),
    ]
    expect(parseTodos(messages)).toEqual([])
  })

  it("解析对象形态 output（todos 数组）", () => {
    const messages = [
      message(
        todoPart({
          todos: [
            { content: "读通布局状态机", status: "completed", priority: "high" },
            { content: "写信息栏组件", status: "in_progress" },
            { content: "补触控测试", status: "pending", priority: "low" },
          ],
        }),
      ),
    ]
    expect(parseTodos(messages)).toEqual([
      { id: "todo-0", content: "读通布局状态机", status: "completed", priority: "high" },
      { id: "todo-1", content: "写信息栏组件", status: "in_progress", priority: null },
      { id: "todo-2", content: "补触控测试", status: "pending", priority: "low" },
    ])
  })

  it("解析 JSON 字符串形态 output", () => {
    const output = JSON.stringify({ todos: [{ content: "接通 Git 适配层", status: "done" }] })
    expect(parseTodos([message(todoPart(output))])).toEqual([
      { id: "todo-0", content: "接通 Git 适配层", status: "completed", priority: null },
    ])
  })

  it("解析顶层数组与 result 嵌套数组", () => {
    expect(parseTodos([message(todoPart([{ text: "顶层数组", status: "active" }]))])).toEqual([
      { id: "todo-0", content: "顶层数组", status: "in_progress", priority: null },
    ])
    expect(
      parseTodos([message(todoPart({ result: [{ content: "嵌套结果", status: "pending" }] }))]),
    ).toEqual([{ id: "todo-0", content: "嵌套结果", status: "pending", priority: null }])
  })

  it("非 JSON 字符串按纯文本清单处理，一行一条并去掉前导符号", () => {
    const output = "- 第一步\n2. 第二步\n  * 第三步"
    expect(parseTodos([message(todoPart(output))])).toEqual([
      { id: "text-0", content: "第一步", status: "pending", priority: null },
      { id: "text-1", content: "第二步", status: "pending", priority: null },
      { id: "text-2", content: "第三步", status: "pending", priority: null },
    ])
  })

  it("output 缺失（工具仍在跑）时跳过，继续往前找更早的清单", () => {
    const messages = [
      message(
        { id: "p0", type: "text", text: "开始规划" },
        todoPart({ todos: [{ content: "旧清单", status: "pending" }] }),
      ),
      message(todoPart(undefined)),
    ]
    expect(parseTodos(messages)).toEqual([
      { id: "todo-0", content: "旧清单", status: "pending", priority: null },
    ])
  })

  it("完全缺失 state 的 part 不会抛错，按无任务处理", () => {
    const messages = [message({ id: "p1", type: "tool", tool: "todo_write" })]
    expect(parseTodos(messages)).toEqual([])
  })

  it("空数组 output 视为「已清空的任务清单」，不再回退到更早的清单", () => {
    // 消息倒序：清空的那次调用排在最前面，应直接得到空清单。
    const messages = [
      message(todoPart({ todos: [] })),
      message(todoPart({ todos: [{ content: "上一轮任务", status: "pending" }] })),
    ]
    expect(parseTodos(messages)).toEqual([])
  })

  it("空字符串 output 同样解析为空清单", () => {
    expect(parseTodos([message(todoPart("   "))])).toEqual([])
  })

  it("取最新一次 todo_write：消息倒序时以排在前面的那份为准", () => {
    const messages = [
      message(todoPart({ todos: [{ content: "最新清单", status: "pending" }] })),
      message(todoPart({ todos: [{ content: "过期清单", status: "pending" }] })),
    ]
    expect(parseTodos(messages)[0]?.content).toBe("最新清单")
  })

  it("保留条目 id，并丢弃没有可读文本的条目", () => {
    const output = {
      todos: [
        { id: "a1", content: "有 id 的任务", status: "pending" },
        { status: "pending" },
        { content: "   ", status: "pending" },
        42,
        "字符串条目",
      ],
    }
    expect(parseTodos([message(todoPart(output))])).toEqual([
      { id: "a1", content: "有 id 的任务", status: "pending", priority: null },
      { id: "todo-4", content: "字符串条目", status: "pending", priority: null },
    ])
  })

  it("status 未知或缺省时归一为 pending", () => {
    const output = { todos: [{ content: "a", status: "weird" }, { content: "b" }] }
    expect(parseTodos([message(todoPart(output))]).map((t) => t.status)).toEqual(["pending", "pending"])
  })

  it("消息没有 parts 字段时安全跳过", () => {
    const messages = [{ parts: undefined } as unknown as MessageLike]
    expect(parseTodos(messages)).toEqual([])
  })
})
