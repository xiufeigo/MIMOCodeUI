export const LEFT_SIDEBAR_MIN = 180
export const LEFT_SIDEBAR_MAX = 400
export const LEFT_SIDEBAR_COLLAPSED = 64
export const RIGHT_SIDEBAR_MIN = 300
export const RIGHT_SIDEBAR_MAX = 560
export const CENTER_PANE_MIN = 520
export const WORKSPACE_GUTTER = 24

export type WorkspaceLayoutMode = "wide" | "left-hidden" | "compact"

export function clampLeftSidebarWidth(value: number): number {
  return Math.round(Math.min(LEFT_SIDEBAR_MAX, Math.max(LEFT_SIDEBAR_MIN, value)))
}

export function clampRightSidebarWidth(value: number): number {
  return Math.round(Math.min(RIGHT_SIDEBAR_MAX, Math.max(RIGHT_SIDEBAR_MIN, value)))
}

/**
 * Preserve a usable chat pane before deciding which side panel to hide. The
 * order mirrors desktop OpenCode: navigation disappears first, then context.
 */
export function workspaceLayoutMode(
  availableWidth: number,
  leftWidth: number,
  rightWidth: number,
  rightOpen: boolean,
): WorkspaceLayoutMode {
  const right = rightOpen ? rightWidth : 0
  if (availableWidth >= leftWidth + right + CENTER_PANE_MIN + WORKSPACE_GUTTER) return "wide"
  if (availableWidth >= right + CENTER_PANE_MIN + WORKSPACE_GUTTER) return "left-hidden"
  return "compact"
}
