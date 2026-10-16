import { describe, expect, it } from "vitest"
import {
  DEFAULT_SHELL_LAYOUT,
  EXPANDED_MIN_WIDTH,
  SHELL_LAYOUT_KEY,
  canExpandRightPanel,
  closeRightShell,
  deriveShellChrome,
  loadShellLayout,
  mainContentInset,
  normalizeShellLayout,
  openLeftShell,
  saveShellLayout,
  setRightExpanded,
  shellSidebarWidth,
  toggleRightExpanded,
  toggleShell,
  type ShellLayoutState,
} from "./shell-layout"

const base: ShellLayoutState = {
  left: true,
  right: true,
  info: true,
  bottom: true,
  expanded: false,
}

describe("deriveShellChrome — 顶栏按钮归属", () => {
  it("左侧栏打开时，主区顶栏左侧不出现入口（归左栏自己所有）", () => {
    expect(deriveShellChrome(base).mainLeft).toEqual([])
  })

  it("左侧栏关闭时，主区顶栏左侧补上「打开左侧栏 / 新建任务」", () => {
    const chrome = deriveShellChrome({ ...base, left: false })
    expect(chrome.mainLeft).toEqual(["openLeft", "newTask"])
  })

  it("右栏关闭时，主区顶栏右侧三枚齐全", () => {
    const chrome = deriveShellChrome({ ...base, right: false })
    expect(chrome.mainRight).toEqual(["info", "bottom", "rightPanel"])
    expect(chrome.rightHeader).toEqual([])
  })

  it("右栏打开时，「切换侧边栏」迁移到右栏顶栏，主区只剩两枚", () => {
    const chrome = deriveShellChrome({ ...base, right: true })
    expect(chrome.mainRight).toEqual(["info", "bottom"])
    expect(chrome.rightHeader).toEqual(["expand", "rightPanel"])
  })

  it("窗口键可见时需要为主区顶栏预留让位空间", () => {
    expect(deriveShellChrome(base, { showWindowControls: true }).reserveWindowControlsSpace).toBe(true)
    expect(deriveShellChrome(base, { showWindowControls: false }).reserveWindowControlsSpace).toBe(false)
  })
})

describe("deriveShellChrome — 中栏可见性", () => {
  it("普通状态下消息区与输入框都可见", () => {
    const chrome = deriveShellChrome(base)
    expect(chrome.messagesVisible).toBe(true)
    expect(chrome.composerVisible).toBe(true)
  })

  it("右栏展开占据主屏时隐藏消息区，但输入框必须保留", () => {
    const chrome = deriveShellChrome({ ...base, expanded: true })
    expect(chrome.messagesVisible).toBe(false)
    expect(chrome.composerVisible).toBe(true)
  })
})

describe("normalizeShellLayout — 不变量", () => {
  it("右栏关闭时强制退出展开态", () => {
    const next = normalizeShellLayout({ ...base, right: false, expanded: true })
    expect(next.expanded).toBe(false)
  })

  it("展开态下宽度不足则自动退回并排", () => {
    const next = normalizeShellLayout(
      { ...base, expanded: true },
      { availableWidth: EXPANDED_MIN_WIDTH - 1 },
    )
    expect(next.expanded).toBe(false)
    expect(next.right).toBe(true)
  })

  it("宽度充足时保持展开态", () => {
    const next = normalizeShellLayout(
      { ...base, expanded: true },
      { availableWidth: EXPANDED_MIN_WIDTH },
    )
    expect(next.expanded).toBe(true)
  })
})

describe("开关操作", () => {
  it("toggleShell 不修改入参", () => {
    const before = { ...base }
    toggleShell(before, "info")
    expect(before).toEqual(base)
  })

  it("切换右栏开关即等价于开关面板", () => {
    expect(toggleShell(base, "right").right).toBe(false)
    expect(toggleShell({ ...base, right: false }, "right").right).toBe(true)
  })

  it("关闭右栏会一并退出展开态", () => {
    expect(closeRightShell({ ...base, expanded: true })).toMatchObject({
      right: false,
      expanded: false,
    })
  })

  it("打开左栏是幂等的", () => {
    expect(openLeftShell({ ...base, left: false }).left).toBe(true)
    expect(openLeftShell(base).left).toBe(true)
  })

  it("宽度不足时请求展开会自动打开右栏但不展开", () => {
    const next = setRightExpanded({ ...base, right: false }, true, 320)
    expect(next.right).toBe(true)
    expect(next.expanded).toBe(false)
  })

  it("canExpandRightPanel 要求右栏已开且宽度达标", () => {
    expect(canExpandRightPanel(base, 1600)).toBe(true)
    expect(canExpandRightPanel({ ...base, right: false }, 1600)).toBe(false)
    expect(canExpandRightPanel(base, 320)).toBe(false)
  })

  it("toggleRightExpanded 在并排与展开之间往返", () => {
    const expanded = toggleRightExpanded(base, 1600)
    expect(expanded.expanded).toBe(true)
    expect(toggleRightExpanded(expanded, 1600).expanded).toBe(false)
  })
})

describe("几何", () => {
  it("侧栏宽度被夹到合法区间", () => {
    expect(shellSidebarWidth("left", 10)).toBeGreaterThanOrEqual(180)
    expect(shellSidebarWidth("left", 9999)).toBeLessThanOrEqual(400)
    expect(shellSidebarWidth("right", 10)).toBeGreaterThanOrEqual(300)
    expect(shellSidebarWidth("right", 9999)).toBeLessThanOrEqual(560)
  })

  it("未给配置值时使用回退宽度", () => {
    expect(shellSidebarWidth("left")).toBe(240)
    expect(shellSidebarWidth("right")).toBe(372)
  })

  it("信息栏打开时主内容让位，关闭时不让位", () => {
    expect(mainContentInset({ ...base, info: true }, 1600)).toBeGreaterThan(0)
    expect(mainContentInset({ ...base, info: false }, 1600)).toBe(0)
  })

  it("窄屏下信息栏不让位，避免压住输入框", () => {
    expect(mainContentInset({ ...base, info: true }, 900)).toBe(0)
  })
})

describe("持久化", () => {
  it("往返保存与读取", () => {
    const state: ShellLayoutState = { left: false, right: true, info: false, bottom: true, expanded: false }
    saveShellLayout(state)
    expect(localStorage.getItem(SHELL_LAYOUT_KEY)).toBeTruthy()
    expect(loadShellLayout()).toEqual(state)
  })

  it("无存档时回退到默认值", () => {
    localStorage.removeItem(SHELL_LAYOUT_KEY)
    expect(loadShellLayout()).toEqual(DEFAULT_SHELL_LAYOUT)
  })

  it("存档缺字段时逐项回退，不整体丢弃", () => {
    localStorage.setItem(SHELL_LAYOUT_KEY, JSON.stringify({ left: false }))
    const loaded = loadShellLayout()
    expect(loaded.left).toBe(false)
    expect(loaded.right).toBe(DEFAULT_SHELL_LAYOUT.right)
    expect(loaded.info).toBe(DEFAULT_SHELL_LAYOUT.info)
  })

  it("存档损坏时安全回退", () => {
    localStorage.setItem(SHELL_LAYOUT_KEY, "{ not json")
    expect(loadShellLayout()).toEqual(DEFAULT_SHELL_LAYOUT)
  })

  it("存档里残留 expanded=true 但 right=false 会被纠正", () => {
    localStorage.setItem(
      SHELL_LAYOUT_KEY,
      JSON.stringify({ left: true, right: false, info: true, bottom: true, expanded: true }),
    )
    expect(loadShellLayout().expanded).toBe(false)
  })
})
