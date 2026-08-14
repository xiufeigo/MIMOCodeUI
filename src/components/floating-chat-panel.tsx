import { createEffect, createSignal, Show, type Component } from "solid-js"
import { MessageSquare, Pin, GripVertical, RotateCcw } from "lucide-solid"
import { useApp } from "../lib/store/provider"
import { useSessionPreferences } from "../lib/session-preferences"
import type { AgentInfo } from "../lib/protocol/types"
import { MessageList } from "./message/message-list"
import { PromptInput, type PromptModelOption } from "./prompt/prompt-input"
import type { ReasoningEffort, ReasoningEffortOption } from "./prompt/types"
import { PermissionPrompt } from "./dialog/permission-prompt"
import { QuestionPrompt } from "./dialog/question-prompt"

interface FloatingChatPanelProps {
  /** 右栏元素作为浮窗边界，避免全局 DOM 查询。 */
  boundsElement?: HTMLElement | null
  open: boolean
  sessionID: string
  /** 固定为普通分栏对话。 */
  onPinToPanel: () => void
  agent?: string
  model?: string
  reasoningEffort?: ReasoningEffort
  /** 思考强度选项（由当前模型 variants 生成；缺省回退五档）。 */
  effortOptions?: ReasoningEffortOption[]
  agents?: AgentInfo[]
  models?: PromptModelOption[]
  onAgentChange?: (agent: string | undefined) => void
  onModelChange?: (model: string | undefined) => void
  onReasoningEffortChange?: (effort: ReasoningEffort) => void
  /** 子智能体会话的父会话 id（非空时输入框只读）。 */
  parentSessionID?: string | null
  onReturnToParent?: () => void
}

const MARGIN = 10
const TABBAR_H = 44
const MIN_W = 320
const MIN_H = 360
const DEFAULT_W = 460
const DEFAULT_H = 560

/**
 * 浮动完整对话：限定在全宽扩展右栏的圆角边界内移动和调整大小。
 * 固定按钮会退出悬浮模式并恢复普通中栏+右栏分栏。
 */
export const FloatingChatPanel: Component<FloatingChatPanelProps> = (p) => {
  const { store } = useApp()
  const { displayTitle } = useSessionPreferences()
  const [pos, setPos] = createSignal({ x: 0, y: 0 })
  const [size, setSize] = createSignal({ w: DEFAULT_W, h: DEFAULT_H })

  let containerEl: HTMLDivElement | undefined
  let dragState: { pointerID: number; startX: number; startY: number; origX: number; origY: number } | null = null
  let resizeState: { pointerID: number; startX: number; startY: number; origW: number; origH: number } | null = null

  const messages = () => store.sessionMessages(p.sessionID)
  const title = () => displayTitle(p.sessionID, store.store.sessions[p.sessionID]?.title)

  function panelMetrics() {
    const host = containerEl?.parentElement
    const panel = p.boundsElement
    if (!host || !panel) return null
    const hostRect = host.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    return { hostRect, panelRect }
  }

  function usableSize(metrics: NonNullable<ReturnType<typeof panelMetrics>>) {
    return {
      width: Math.max(1, metrics.panelRect.width - MARGIN * 2),
      height: Math.max(1, metrics.panelRect.height - TABBAR_H - MARGIN * 2),
    }
  }

  function clampSize(next: { w: number; h: number }, metrics: NonNullable<ReturnType<typeof panelMetrics>>) {
    const usable = usableSize(metrics)
    const minWidth = Math.min(MIN_W, usable.width)
    const minHeight = Math.min(MIN_H, usable.height)
    return {
      w: Math.max(minWidth, Math.min(next.w, usable.width)),
      h: Math.max(minHeight, Math.min(next.h, usable.height)),
    }
  }

  function bounds(nextSize = size()) {
    const metrics = panelMetrics()
    if (!metrics) return null
    const safeSize = clampSize(nextSize, metrics)
    return {
      minX: metrics.panelRect.left - metrics.hostRect.left + MARGIN,
      minY: metrics.panelRect.top - metrics.hostRect.top + TABBAR_H + MARGIN,
      maxX: metrics.panelRect.right - metrics.hostRect.left - safeSize.w - MARGIN,
      maxY: metrics.panelRect.bottom - metrics.hostRect.top - safeSize.h - MARGIN,
      size: safeSize,
    }
  }

  function resetIntoPanel() {
    const metrics = panelMetrics()
    if (!metrics) return
    const nextSize = clampSize({ w: DEFAULT_W, h: DEFAULT_H }, metrics)
    const nextBounds = bounds(nextSize)
    if (!nextBounds) return
    setSize(nextSize)
    setPos({ x: Math.max(nextBounds.minX, nextBounds.maxX), y: nextBounds.minY })
  }

  createEffect(() => {
    if (!p.open) return
    requestAnimationFrame(resetIntoPanel)
  })

  createEffect(() => {
    if (!p.open) return
    const onWindowResize = () => {
      const nextBounds = bounds()
      if (!nextBounds) return
      setSize(nextBounds.size)
      setPos((previous) => ({
        x: Math.min(Math.max(previous.x, nextBounds.minX), Math.max(nextBounds.minX, nextBounds.maxX)),
        y: Math.min(Math.max(previous.y, nextBounds.minY), Math.max(nextBounds.minY, nextBounds.maxY)),
      }))
    }
    window.addEventListener("resize", onWindowResize)
    return () => window.removeEventListener("resize", onWindowResize)
  })

  createEffect(() => {
    if (!p.open || !p.boundsElement) return
    const observer = new ResizeObserver(() => {
      const nextBounds = bounds()
      if (!nextBounds) return
      setSize(nextBounds.size)
      setPos((previous) => ({
        x: Math.min(Math.max(previous.x, nextBounds.minX), Math.max(nextBounds.minX, nextBounds.maxX)),
        y: Math.min(Math.max(previous.y, nextBounds.minY), Math.max(nextBounds.minY, nextBounds.maxY)),
      }))
    })
    observer.observe(p.boundsElement)
    return () => observer.disconnect()
  })

  function startDrag(event: PointerEvent) {
    if (event.button !== 0) return
    dragState = { pointerID: event.pointerId, startX: event.clientX, startY: event.clientY, origX: pos().x, origY: pos().y }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function startResize(event: PointerEvent) {
    if (event.button !== 0) return
    resizeState = { pointerID: event.pointerId, startX: event.clientX, startY: event.clientY, origW: size().w, origH: size().h }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function onMove(event: PointerEvent) {
    if (dragState?.pointerID === event.pointerId) {
      const nextBounds = bounds()
      if (!nextBounds) return
      const x = Math.min(Math.max(dragState.origX + event.clientX - dragState.startX, nextBounds.minX), Math.max(nextBounds.minX, nextBounds.maxX))
      const y = Math.min(Math.max(dragState.origY + event.clientY - dragState.startY, nextBounds.minY), Math.max(nextBounds.minY, nextBounds.maxY))
      setPos({ x, y })
      return
    }

    if (resizeState?.pointerID === event.pointerId) {
      const metrics = panelMetrics()
      if (!metrics) return
      const maxWidth = metrics.panelRect.right - metrics.hostRect.left - pos().x - MARGIN
      const maxHeight = metrics.panelRect.bottom - metrics.hostRect.top - pos().y - MARGIN
      const next = clampSize(
        {
          w: Math.min(maxWidth, resizeState.origW + event.clientX - resizeState.startX),
          h: Math.min(maxHeight, resizeState.origH + event.clientY - resizeState.startY),
        },
        metrics,
      )
      setSize(next)
    }
  }

  function onUp(event: PointerEvent) {
    if (dragState && dragState.pointerID !== event.pointerId) return
    if (resizeState && resizeState.pointerID !== event.pointerId) return
    dragState = null
    resizeState = null
  }

  return (
    <Show when={p.open}>
      <div
        ref={containerEl}
        class="absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xl"
        style={{ left: `${pos().x}px`, top: `${pos().y}px`, width: `${size().w}px`, height: `${size().h}px` }}
      >
        <div class="flex h-10 shrink-0 cursor-move select-none items-center gap-2 border-b border-[var(--border-color)] px-3" onPointerDown={startDrag} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <MessageSquare size={15} class="shrink-0 text-[var(--text-muted)]" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{title()}</span>
          <button
            class="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              resetIntoPanel()
            }}
            title="复位对话位置"
            aria-label="复位对话位置"
          >
            <RotateCcw size={15} />
          </button>
          <button
            class="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              p.onPinToPanel()
            }}
            title="固定对话面板"
            aria-label="固定对话面板"
          >
            <Pin size={15} />
          </button>
        </div>

        <MessageList sessionID={p.sessionID} messages={messages()} />
        <PermissionPrompt sessionID={p.sessionID} />
        <QuestionPrompt sessionID={p.sessionID} />
        <PromptInput
          sessionID={p.sessionID}
          agent={p.agent}
          model={p.model}
          reasoningEffort={p.reasoningEffort ?? "default"}
          effortOptions={p.effortOptions}
          agents={p.agents}
          models={p.models}
          onAgentChange={p.onAgentChange}
          onModelChange={p.onModelChange}
          onReasoningEffortChange={p.onReasoningEffortChange}
          parentSessionID={p.parentSessionID}
          onReturnToParent={p.onReturnToParent}
        />

        <div
          class="absolute bottom-0 right-0 z-10 cursor-nwse-resize p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
          onPointerDown={startResize}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          title="调整大小"
        >
          <GripVertical size={14} class="rotate-90" />
        </div>
      </div>
    </Show>
  )
}
