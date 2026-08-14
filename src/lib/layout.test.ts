import { describe, expect, it } from "vitest"
import {
  CENTER_PANE_MIN,
  clampLeftSidebarWidth,
  clampRightSidebarWidth,
  workspaceLayoutMode,
} from "./layout"

describe("workspace layout", () => {
  it("clamps persisted sidebar widths", () => {
    expect(clampLeftSidebarWidth(20)).toBe(180)
    expect(clampLeftSidebarWidth(900)).toBe(400)
    expect(clampRightSidebarWidth(20)).toBe(300)
    expect(clampRightSidebarWidth(900)).toBe(560)
  })

  it("hides navigation before context", () => {
    expect(workspaceLayoutMode(1280, 240, 384, true)).toBe("wide")
    expect(workspaceLayoutMode(1100, 240, 384, true)).toBe("left-hidden")
    expect(workspaceLayoutMode(900, 240, 384, true)).toBe("compact")
    expect(CENTER_PANE_MIN).toBeGreaterThanOrEqual(520)
  })
})
