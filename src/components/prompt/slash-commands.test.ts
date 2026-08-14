import { describe, expect, it } from "vitest"
import { activeSlash, filterSlashCommands } from "../../components/prompt/slash-commands"

describe("activeSlash", () => {
  it("detects a slash at line start", () => {
    expect(activeSlash("/agent", 6)).toEqual({ start: 0, query: "agent" })
    expect(activeSlash("/ag", 3)).toEqual({ start: 0, query: "ag" })
  })

  it("detects a slash after whitespace", () => {
    expect(activeSlash("hello /mod", 10)).toEqual({ start: 6, query: "mod" })
  })

  it("rejects a slash not preceded by start or whitespace", () => {
    expect(activeSlash("https://x", 8)).toBeNull()
    expect(activeSlash("a/b", 3)).toBeNull()
  })

  it("rejects when a space follows the slash (command already ended)", () => {
    expect(activeSlash("/agent ", 7)).toBeNull()
  })

  it("rejects a slash after a newline boundary", () => {
    expect(activeSlash("line1\n/foo", 10)).toEqual({ start: 6, query: "foo" })
  })
})

describe("filterSlashCommands", () => {
  it("returns all commands for an empty query", () => {
    expect(filterSlashCommands("").length).toBeGreaterThan(0)
  })

  it("matches by name prefix", () => {
    const results = filterSlashCommands("agent")
    expect(results.some((c) => c.command === "/agent")).toBe(true)
  })
})
