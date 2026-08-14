import { createSignal, onCleanup, type Component } from "solid-js"

interface SidebarResizeHandleProps {
  side: "left" | "right"
  value: number
  min: number
  max: number
  disabled?: boolean
  onPreview: (value: number) => void
  onCommit: (value: number) => void
}

/** Pointer-captured splitter that previews width while dragging and persists once released. */
export const SidebarResizeHandle: Component<SidebarResizeHandleProps> = (p) => {
  const [dragging, setDragging] = createSignal(false)
  let activePointer: number | null = null
  let startX = 0
  let startValue = 0

  function clamp(value: number) {
    return Math.round(Math.min(p.max, Math.max(p.min, value)))
  }

  function endDrag() {
    activePointer = null
    setDragging(false)
  }

  function onPointerDown(event: PointerEvent) {
    if (p.disabled || event.button !== 0) return
    activePointer = event.pointerId
    startX = event.clientX
    startValue = p.value
    const target = event.currentTarget as HTMLDivElement
    target.setPointerCapture(event.pointerId)
    setDragging(true)
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent) {
    if (activePointer !== event.pointerId) return
    const delta = event.clientX - startX
    const value = clamp(startValue + (p.side === "left" ? delta : -delta))
    p.onPreview(value)
  }

  function onPointerUp(event: PointerEvent) {
    if (activePointer !== event.pointerId) return
    const delta = event.clientX - startX
    const value = clamp(startValue + (p.side === "left" ? delta : -delta))
    p.onPreview(value)
    p.onCommit(value)
    endDrag()
  }

  onCleanup(endDrag)

  return (
    <div
      class={`group relative z-20 flex w-2 shrink-0 cursor-col-resize touch-none items-stretch justify-center ${
        p.disabled ? "pointer-events-none opacity-0" : ""
      }`}
      role="separator"
      aria-orientation="vertical"
      aria-label={p.side === "left" ? "调整左侧栏宽度" : "调整右侧栏宽度"}
      aria-valuemin={p.min}
      aria-valuemax={p.max}
      aria-valuenow={p.value}
      tabIndex={p.disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={endDrag}
      onKeyDown={(event) => {
        if (p.disabled) return
        const step = event.shiftKey ? 32 : 12
        const increase = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
        if (!increase) return
        event.preventDefault()
        const direction = p.side === "left" ? increase : -increase
        const value = clamp(p.value + direction * step)
        p.onPreview(value)
        p.onCommit(value)
      }}
    >
      <span
        class={`my-2 w-px rounded-full bg-transparent transition-colors group-hover:bg-[var(--border-strong)] ${
          dragging() ? "bg-[var(--accent)]" : ""
        }`}
      />
    </div>
  )
}
