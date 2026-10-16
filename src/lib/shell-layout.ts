// 应用外壳布局状态机（Android Pad 布局重构）。
//
// 设计要点：布局是 5 个**正交开关**的组合，而不是若干固定布局。
//   left     左侧任务栏显隐
//   right    右侧栏（审查/文件/侧边聊天/浏览器/终端）显隐
//   info     信息栏（环境信息/任务清单/产物/参考）浮层显隐
//   bottom   底部面板（终端）显隐
//   expanded 右侧栏是否占据主屏（吞掉中栏）
//
// 由这 5 个开关派生出「顶栏按钮摆在哪」——这是本文件存在的主要理由：
// 参考设计里右侧栏打开时，主区顶栏只保留「信息栏 / 切换底部」，
// 而「展开面板 / 切换侧边栏」会迁移到右栏自己的顶栏。

import { LEFT_SIDEBAR_MIN, RIGHT_SIDEBAR_MIN, LEFT_SIDEBAR_MAX, RIGHT_SIDEBAR_MAX } from "./layout"

export type ShellToggle = "left" | "right" | "info" | "bottom" | "expanded"

/** 展开态下右栏占满主屏，中栏让出的最小宽度（输入框仍需可用）。 */
export const EXPANDED_MIN_WIDTH = 480

export interface ShellLayoutState {
  left: boolean
  right: boolean
  info: boolean
  bottom: boolean
  expanded: boolean
}

export const DEFAULT_SHELL_LAYOUT: ShellLayoutState = {
  left: true,
  right: true,
  info: true,
  bottom: true,
  expanded: false,
}

/** 主区顶栏左侧按钮位。 */
export type MainLeftAction = "openLeft" | "newTask"
/** 主区顶栏右侧按钮位。 */
export type MainRightAction = "info" | "bottom" | "rightPanel"
/** 右侧栏顶栏按钮位。 */
export type RightHeaderAction = "expand" | "rightPanel"

export interface ShellChrome {
  /** 主区顶栏左侧：左侧栏关闭时才出现「打开左侧栏 + 新建任务」。 */
  mainLeft: MainLeftAction[]
  /** 主区顶栏右侧。 */
  mainRight: MainRightAction[]
  /** 右栏顶栏（仅右栏打开时有内容）。 */
  rightHeader: RightHeaderAction[]
  /** 右栏是否以「独立标签行」形态展示（5 个入口列表）。 */
  rightPanelSectioned: boolean
  /** 中栏消息区是否可见（右栏展开占据主屏时隐藏）。 */
  messagesVisible: boolean
  /** 输入框是否可见（任何状态下都保留）。 */
  composerVisible: boolean
  /** 是否需要给主区顶栏右侧预留窗口键宽度。 */
  reserveWindowControlsSpace: boolean
}

/**
 * 强制不变量。任何绕过 toggle 直接改 state 的路径都应先过这里：
 *  1. 展开态必须右栏打开（否则「展开」无处可展）
 *  2. 右栏关闭则不可能处于展开态
 *  3. 右栏打开时，窄屏不得保持展开（输入框会被挤没）
 */
export function normalizeShellLayout(
  state: ShellLayoutState,
  options?: { availableWidth?: number },
): ShellLayoutState {
  let next = { ...state }
  if (next.expanded && !next.right) next.expanded = false
  if (next.expanded && options?.availableWidth !== undefined) {
    if (options.availableWidth < EXPANDED_MIN_WIDTH) next.expanded = false
  }
  return next
}

/** 是否允许进入展开态（宽度不足时按钮应禁用而非点击后无反应）。 */
export function canExpandRightPanel(state: ShellLayoutState, availableWidth: number): boolean {
  return state.right && availableWidth >= EXPANDED_MIN_WIDTH
}

/**
 * 由 5 个开关推导顶栏按钮的分布与中栏可见性。
 * 这是「按钮搬家」规则的唯一事实来源。
 */
export function deriveShellChrome(
  state: ShellLayoutState,
  options?: { showWindowControls?: boolean },
): ShellChrome {
  const s = normalizeShellLayout(state)
  const showWindowControls = options?.showWindowControls !== false

  // 左侧栏关闭时，主区顶栏左侧补上「打开左侧栏 / 新建任务」；
  // 左侧栏打开时，这两个入口归左侧栏自己的顶栏所有。
  const mainLeft: MainLeftAction[] = s.left ? [] : ["openLeft", "newTask"]

  // 「信息栏」「切换底部」始终属于中栏；「切换侧边栏」在右栏打开时
  // 迁移到右栏顶栏，所以主区顶栏此时不再显示它。
  const mainRight: MainRightAction[] = s.right ? ["info", "bottom"] : ["info", "bottom", "rightPanel"]

  // 右栏顶栏：「展开/收起面板」+「切换侧边栏（关闭）」。
  const rightHeader: RightHeaderAction[] = s.right ? ["expand", "rightPanel"] : []

  return {
    mainLeft,
    mainRight,
    rightHeader,
    rightPanelSectioned: s.right,
    // 展开态下右栏吃掉主屏，消息区隐藏，但输入框必须保留在底部。
    messagesVisible: !s.expanded,
    composerVisible: true,
    reserveWindowControlsSpace: showWindowControls,
  }
}

/** 纯函数式开关切换；返回新对象，不修改入参。 */
export function toggleShell(state: ShellLayoutState, key: ShellToggle): ShellLayoutState {
  const next: ShellLayoutState = { ...state, [key]: !state[key] }
  return normalizeShellLayout(next)
}

/** 显式打开左栏（从悬停预览 / 顶栏按钮进入）。 */
export function openLeftShell(state: ShellLayoutState): ShellLayoutState {
  return { ...state, left: true }
}

/** 关闭左栏。 */
export function closeLeftShell(state: ShellLayoutState): ShellLayoutState {
  return { ...state, left: false }
}

/** 打开右栏。关闭右栏会同时退出展开态。 */
export function openRightShell(state: ShellLayoutState): ShellLayoutState {
  return normalizeShellLayout({ ...state, right: true })
}

export function closeRightShell(state: ShellLayoutState): ShellLayoutState {
  return { ...state, right: false, expanded: false }
}

/** 展开 / 收起右栏。展开前需满足宽度下限。 */
export function setRightExpanded(
  state: ShellLayoutState,
  expanded: boolean,
  availableWidth: number,
): ShellLayoutState {
  if (expanded && !canExpandRightPanel(state, availableWidth)) {
    return normalizeShellLayout({ ...state, right: true })
  }
  return normalizeShellLayout({ ...state, expanded, right: expanded ? true : state.right })
}

export function toggleRightExpanded(
  state: ShellLayoutState,
  availableWidth: number,
): ShellLayoutState {
  return setRightExpanded(state, !state.expanded, availableWidth)
}

// ---------------------------------------------------------------------------
// 持久化
// ---------------------------------------------------------------------------

export const SHELL_LAYOUT_KEY = "mimocode-ui.shell-layout"

/** 只持久化「用户显式选择过」的开关；未记录时用默认值。 */
export function saveShellLayout(state: ShellLayoutState): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(SHELL_LAYOUT_KEY, JSON.stringify(state))
  } catch {
    // 隐私模式 / 配额用尽时静默降级为不持久化。
  }
}

export function loadShellLayout(fallback: ShellLayoutState = DEFAULT_SHELL_LAYOUT): ShellLayoutState {
  if (typeof localStorage === "undefined") return { ...fallback }
  try {
    const raw = localStorage.getItem(SHELL_LAYOUT_KEY)
    if (!raw) return { ...fallback }
    const parsed = JSON.parse(raw) as Partial<ShellLayoutState>
    return normalizeShellLayout({
      left: typeof parsed.left === "boolean" ? parsed.left : fallback.left,
      right: typeof parsed.right === "boolean" ? parsed.right : fallback.right,
      info: typeof parsed.info === "boolean" ? parsed.info : fallback.info,
      bottom: typeof parsed.bottom === "boolean" ? parsed.bottom : fallback.bottom,
      expanded: typeof parsed.expanded === "boolean" ? parsed.expanded : fallback.expanded,
    })
  } catch {
    return { ...fallback }
  }
}

// ---------------------------------------------------------------------------
// 几何
// ---------------------------------------------------------------------------

export const LEFT_SIDEBAR_FALLBACK_WIDTH = 240
export const RIGHT_SIDEBAR_FALLBACK_WIDTH = 372

export function shellSidebarWidth(side: "left" | "right", configured?: number): number {
  const fallback = side === "left" ? LEFT_SIDEBAR_FALLBACK_WIDTH : RIGHT_SIDEBAR_FALLBACK_WIDTH
  const value = configured ?? fallback
  const min = side === "left" ? LEFT_SIDEBAR_MIN : RIGHT_SIDEBAR_MIN
  const max = side === "left" ? LEFT_SIDEBAR_MAX : RIGHT_SIDEBAR_MAX
  return Math.round(Math.min(max, Math.max(min, value)))
}

/**
 * 信息栏为悬浮浮层，定位在主区右侧内边距内。
 * 主内容需要为它让位，否则消息气泡与输入框会被压在卡片下面。
 */
export const INFO_PANEL_WIDTH = 274
export const INFO_PANEL_GUTTER = 22

export function mainContentInset(state: ShellLayoutState, availableWidth: number): number {
  if (!state.info) return 0

  // 窄屏下信息栏会与输入框冲突，此时直接不占位（由组件层自行避让）。
  return availableWidth >= 1240 ? INFO_PANEL_WIDTH + INFO_PANEL_GUTTER : 0
}
