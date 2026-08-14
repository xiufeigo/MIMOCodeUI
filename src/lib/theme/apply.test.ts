import { describe, expect, it } from "vitest"
import { applyTheme } from "./apply"

describe("applyTheme", () => {
  it("writes semantic variables with exactly one custom-property prefix", () => {
    document.head.innerHTML = ""
    applyTheme(
      {
        id: "test",
        name: "Test",
        dark: { neutral: "#101010", ink: "#f0f0f0", primary: "#00aa00" },
        light: {},
      },
      "dark",
    )
    const css = document.getElementById("mimo-theme")?.textContent ?? ""
    expect(css).toContain("--bg-app:#101010")
    expect(css).not.toContain("----bg-app")
  })

  it("maps surface/border/text/diff tokens from the theme when present", () => {
    document.head.innerHTML = ""
    applyTheme(
      {
        id: "test",
        name: "Test",
        dark: {
          neutral: "#1f1f1f",
          ink: "#f1ece8",
          primary: "#fab283",
          "surface-base": "#1c1c1c",
          "surface-raised-base": "#232323",
          "surface-raised-base-hover": "#282828",
          "text-strong": "#ededed",
          "text-base": "#a0a0a0",
          "text-weaker": "#505050",
          "border-weak-base": "#282828",
          "border-weaker-base": "#232323",
          accent: "#00cc00",
          interactive: "#034cff",
          info: "#a753ae",
          diffAdd: "#9ff29a",
          diffDelete: "#fc533a",
        },
        light: {},
      },
      "dark",
    )
    const css = document.getElementById("mimo-theme")?.textContent ?? ""
    expect(css).toContain("--bg-panel:#1c1c1c")
    expect(css).toContain("--bg-surface:#232323")
    expect(css).toContain("--bg-hover:#282828")
    expect(css).toContain("--text-primary:#ededed")
    expect(css).toContain("--text-secondary:#a0a0a0")
    expect(css).toContain("--border-color:#282828")
    expect(css).toContain("--accent-secondary:#00cc00")
    expect(css).toContain("--interactive:#034cff")
    expect(css).toContain("--info:#a753ae")
    expect(css).toContain("--diff-add:#9ff29a")
    expect(css).toContain("--diff-delete:#fc533a")
  })
})
