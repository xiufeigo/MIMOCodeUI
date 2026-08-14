// PTY terminal support: create a pty via the REST API, exchange a one-time
// connect ticket (browsers cannot set headers on WebSocket upgrade), then
// open the WebSocket with ?ticket=.

import type { ServerConnection } from "./client"
import { basicAuthHeader } from "./client"

export interface PtyInfo {
  id: string
  sessionID?: string
  command?: string
  cwd?: string
  cols?: number
  rows?: number
  state?: string
}

export interface PtyToken {
  ticket?: string
  token?: string
  url?: string
}

async function requestJson<T>(conn: ServerConnection, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${conn.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: basicAuthHeader(conn),
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) throw new Error(`PTY HTTP ${res.status} ${path}`)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function createPty(
  conn: ServerConnection,
  opts: { cols: number; rows: number; cwd?: string; command?: string },
): Promise<PtyInfo> {
  return requestJson<PtyInfo>(conn, "/pty", {
    method: "POST",
    body: JSON.stringify({ ...opts }),
  })
}

export async function getPtyToken(conn: ServerConnection, ptyID: string): Promise<PtyToken> {
  // MiMo gates this endpoint with x-mimocode-ticket: 1 (unlike upstream opencode).
  return requestJson<PtyToken>(conn, `/pty/${ptyID}/connect-token`, {
    method: "POST",
    headers: { "x-mimocode-ticket": "1" },
    body: "{}",
  })
}

export function ptyWebSocketUrl(baseUrl: string, ptyID: string, ticket: string): string {
  const wsBase = baseUrl.replace(/^http/, "ws")
  return `${wsBase}/pty/${ptyID}/connect?ticket=${encodeURIComponent(ticket)}`
}
