import { describe, expect, it } from "vitest"
import {
  LOCAL_SERVER_ID,
  defaultServerProfileStore,
  migrateLegacyConnection,
  normalizeServerProfileStore,
  removeServerProfile,
  upsertServerProfile,
} from "./server-profiles"

describe("server profiles", () => {
  it("migrates the legacy remote connection into a selectable profile", () => {
    const store = migrateLegacyConnection({
      mode: "remote",
      url: "https://mimo.example.com",
      username: "mimocode",
      password: "secret",
    })

    expect(store.activeID).toBe("legacy-remote")
    expect(store.profiles).toEqual([
      { id: LOCAL_SERVER_ID, name: "本地", mode: "local" },
      {
        id: "legacy-remote",
        name: "云端服务器",
        mode: "remote",
        url: "https://mimo.example.com",
        username: "mimocode",
        password: "secret",
      },
    ])
  })

  it("always restores the built-in local profile and a valid active selection", () => {
    const normalized = normalizeServerProfileStore({ version: 1, activeID: "missing", profiles: [] })
    expect(normalized).toEqual(defaultServerProfileStore())
  })

  it("updates and removes remote profiles without removing local", () => {
    const initial = defaultServerProfileStore()
    const withRemote = upsertServerProfile(initial, { id: "remote-a", name: "A", mode: "remote", url: "https://a", username: "u", password: "p" })
    expect(withRemote.profiles).toHaveLength(2)
    expect(removeServerProfile(withRemote, LOCAL_SERVER_ID).profiles).toHaveLength(2)
    expect(removeServerProfile(withRemote, "remote-a").profiles).toHaveLength(1)
  })
})
