import { describe, expect, it } from "vitest"
import { parseLocalCommandContent } from "./message-content"

describe("parseLocalCommandContent", () => {
  it("parses complete raw command wrappers", () => {
    expect(
      parseLocalCommandContent(
        "<command-name>/exit</command-name><command-message>exit</command-message><local-command-stdout>Catch you later!</local-command-stdout>",
      ),
    ).toMatchObject({ kind: "local-command", commandName: "/exit", commandMessage: "exit", stdout: "Catch you later!" })
  })

  it("parses complete entity-encoded wrappers", () => {
    expect(parseLocalCommandContent("&lt;local-command-caveat&gt;Ignore this&lt;/local-command-caveat&gt;")).toMatchObject({
      kind: "local-command",
      caveat: "Ignore this",
    })
  })

  it("leaves partial or surrounding text untouched", () => {
    expect(parseLocalCommandContent("<command-name>/exit</command-name> trailing")).toBeNull()
    expect(parseLocalCommandContent("before <local-command-stdout>x</local-command-stdout>")).toBeNull()
  })

  it("parses a caveat-only wrapper and keeps commandArgs separate", () => {
    expect(
      parseLocalCommandContent("<command-name>ls</command-name><command-args>-la</command-args><local-command-caveat>be careful</local-command-caveat>"),
    ).toMatchObject({ kind: "local-command", commandName: "ls", commandArgs: "-la", caveat: "be careful" })
  })

  it("returns null for empty input", () => {
    expect(parseLocalCommandContent("")).toBeNull()
    expect(parseLocalCommandContent("   ")).toBeNull()
  })
})
