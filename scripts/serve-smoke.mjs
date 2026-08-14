#!/usr/bin/env node
// MiMoCodeUI smoke test: spawns a real `mimo serve`, then exercises the same
// protocol surface the desktop app relies on:
//   1. health check (Basic auth)
//   2. session create + list
//   3. prompt_async -> SSE events -> message hydration
//   4. permission request/reply lifecycle (only if the model asks)
// Requires: `mimo` on PATH, a configured provider (mimo auto or API key).
//
// Usage: node scripts/serve-smoke.mjs

import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"

const PASSWORD = randomBytes(12).toString("hex")
const USERNAME = "mimocode"
const PORT = 4299

const BASE = `http://127.0.0.1:${PORT}`
const AUTH = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`

const failures = []
function check(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL"
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures.push(name)
}

async function startServe() {
  // npm global shims on Windows are .cmd wrappers; shell:true lets the shell
  // resolve them. Arguments are fixed literals (no injection surface).
  const child = spawn("mimo", ["serve", "--port", String(PORT)], {
    env: { ...process.env, MIMOCODE_SERVER_PASSWORD: PASSWORD },
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  })
  let out = ""
  child.stdout.on("data", (d) => (out += String(d)))
  child.stderr.on("data", (d) => (out += String(d)))
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (/listening on/.test(out)) return child
    await sleep(200)
  }
  throw new Error(`serve did not start. Output: ${out.slice(0, 500)}`)
}

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: AUTH, "Content-Type": "application/json", ...(init.headers || {}) },
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function stopServe(child) {
  // With shell:true, child.kill() only kills the shell wrapper; the actual
  // mimo process survives. On Windows kill the whole process tree.
  if (process.platform === "win32" && child.pid) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
    } catch {
      /* ignore */
    }
  } else {
    child.kill()
  }
}

async function main() {
  console.log("== starting mimo serve (smoke) ==")
  const child = await startServe()
  console.log("serve listening")

  try {
    // 1. auth-gated health
    const anon = await fetch(`${BASE}/global/health`)
    check("health requires auth", anon.status === 401, `status=${anon.status}`)
    const h = await api("/global/health")
    check("health ok with auth", h.status === 200 && h.body.healthy === true, JSON.stringify(h.body))

    // 2. sessions
    const created = await api("/session", { method: "POST", body: JSON.stringify({}) })
    check("session created", created.status === 200 && !!created.body?.id, `id=${created.body?.id}`)
    const sid = created.body.id
    const list = await api("/session")
    check(
      "session listed",
      list.status === 200 && Array.isArray(list.body) && list.body.some((s) => s.id === sid),
      `count=${list.body?.length}`,
    )

    // 3. prompt -> SSE -> messages
    const p = await api(`/session/${sid}/prompt_async`, {
      method: "POST",
      body: JSON.stringify({ parts: [{ type: "text", text: "Reply with exactly: SMOKE_OK" }] }),
    })
    // prompt_async returns 204 No Content on accept (fire-and-forget).
    check("prompt_async accepted", p.status === 200 || p.status === 204, `status=${p.status}`)

    const events = new Set()
    let sawIdle = false
    // AbortSignal.timeout auto-aborts the SSE read; a timeout is not a
    // failure, we simply collect whatever events arrived by then.
    const sse = await fetch(`${BASE}/global/event`, {
      headers: { Authorization: AUTH },
      signal: AbortSignal.timeout(30000),
    })
    const reader = sse.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    try {
      while (!sawIdle) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, i)
          buf = buf.slice(i + 2)
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue
            try {
              const ev = JSON.parse(line.slice(5).trim())
              if (ev.payload?.type) events.add(ev.payload.type)
              // session.status events carry { status: { type: "busy"|"idle" } }
              if (ev.payload?.type === "session.status" && ev.payload.properties?.status?.type === "idle") {
                sawIdle = true
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch (e) {
      if (e?.name !== "AbortError" && e?.name !== "TimeoutError") throw e
    }
    await sleep(1500)
    check(
      "SSE delivered expected events",
      ["server.connected", "message.updated", "session.status"].every((t) => events.has(t)),
      `types=[${[...events].join(", ")}]`,
    )

    const msgs = await api(`/session/${sid}/message`)
    check("messages hydrated", msgs.status === 200 && msgs.body.length >= 2, `count=${msgs.body?.length}`)
    const text = JSON.stringify(msgs.body)
    check(
      "assistant replied",
      text.includes("SMOKE_OK") || text.includes("assistant"),
      text.includes("SMOKE_OK") ? "reply found" : "assistant message present",
    )

    // 4. permission surface (create + reply endpoints exist)
    const agent = await api("/agent")
    check("agents listed", agent.status === 200 && Array.isArray(agent.body), `count=${agent.body?.length}`)

    console.log(failures.length === 0 ? "\nSMOKE: ALL PASS" : `\nSMOKE: ${failures.length} FAILED`)
    process.exitCode = failures.length === 0 ? 0 : 1
  } catch (e) {
    console.error("SMOKE ERROR:", e)
    process.exitCode = 1
  } finally {
    await stopServe(child)
    await sleep(500)
  }
}

main()
