export interface LocalCommandContent {
  kind: "local-command"
  stdout?: string
  commandName?: string
  commandMessage?: string
  commandArgs?: string
  caveat?: string
}

const TAG_TO_KEY = {
  "local-command-stdout": "stdout",
  "command-name": "commandName",
  "command-message": "commandMessage",
  "command-args": "commandArgs",
  "local-command-caveat": "caveat",
} as const

type CommandTag = keyof typeof TAG_TO_KEY

const OPEN = "(?:<|&lt;)"
const CLOSE = "(?:>|&gt;)"
const TAG_PATTERN = new RegExp(
  `${OPEN}(local-command-stdout|command-name|command-message|command-args|local-command-caveat)${CLOSE}([\\s\\S]*?)${OPEN}\\/\\1${CLOSE}`,
  "g",
)

/**
 * Decode only the known MiMo local-command wrapper vocabulary. Other markup is
 * intentionally not decoded: streamed or malformed content remains plain text.
 */
export function parseLocalCommandContent(text: string): LocalCommandContent | null {
  const value = text.trim()
  if (!value) return null

  const result: LocalCommandContent = { kind: "local-command" }
  let cursor = 0
  let match: RegExpExecArray | null
  let found = false
  TAG_PATTERN.lastIndex = 0

  while ((match = TAG_PATTERN.exec(value))) {
    if (value.slice(cursor, match.index).trim()) return null
    const tag = match[1] as CommandTag
    const key = TAG_TO_KEY[tag]
    result[key] = match[2].trim()
    cursor = TAG_PATTERN.lastIndex
    found = true
  }

  if (!found || value.slice(cursor).trim()) return null
  return result
}
