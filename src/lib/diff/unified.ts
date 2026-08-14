// Minimal unified-diff parser. Produces line groups with per-line change
// state so the UI can render +/- context lines with colors.

export type DiffLineType = "context" | "add" | "remove" | "meta"

export interface DiffLine {
  type: DiffLineType
  text: string
}

export interface DiffFile {
  oldName: string
  newName: string
  lines: DiffLine[]
  additions: number
  deletions: number
}

function isHeader(line: string): boolean {
  return /^diff --git /.test(line) || /^(new|deleted) file mode /.test(line) || /^index [0-9a-f]{7,}/.test(line)
}

function parseFileHeader(line: string): { oldName: string; newName: string } {
  const m = /^--- "?(.*?)"?$/.exec(line)
  if (m) return { oldName: m[1], newName: "" }
  const m2 = /^\+\+\+ "?(.*?)"?$/.exec(line)
  if (m2) return { oldName: "", newName: m2[1] }
  return { oldName: "", newName: "" }
}

/** Parse a unified diff string into file sections. Empty input -> []. */
export function parseUnifiedDiff(input: string): DiffFile[] {
  const rawLines = input.split(/\r?\n/)
  const files: DiffFile[] = []
  let current: DiffFile | null = null
  let pendingHeader: { oldName: string; newName: string } | null = null

  const flush = () => {
    if (current && current.lines.length > 0) files.push(current)
    current = null
  }

  for (const line of rawLines) {
    if (isHeader(line)) {
      flush()
      pendingHeader = null
      continue
    }
    if (line.startsWith("--- ")) {
      pendingHeader = { ...(pendingHeader ?? {}), ...parseFileHeader(line) }
      continue
    }
    if (line.startsWith("+++ ")) {
      const h = parseFileHeader(line)
      if (pendingHeader) {
        // Only merge the non-empty side; h's empty oldName would clobber it.
        pendingHeader = {
          ...pendingHeader,
          newName: h.newName || pendingHeader.newName,
        }
        current = {
          oldName: pendingHeader.oldName ?? "",
          newName: pendingHeader.newName ?? "",
          lines: [],
          additions: 0,
          deletions: 0,
        }
      }
      pendingHeader = null
      continue
    }
    if (line.startsWith("@@")) {
      if (!current) {
        current = { oldName: "", newName: "", lines: [], additions: 0, deletions: 0 }
      }
      current.lines.push({ type: "meta", text: line })
      continue
    }
    if (!current) {
      // Diff content without file header (e.g. raw patch body)
      current = { oldName: "", newName: "", lines: [], additions: 0, deletions: 0 }
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.lines.push({ type: "add", text: line.slice(1) })
      current.additions++
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.lines.push({ type: "remove", text: line.slice(1) })
      current.deletions++
    } else {
      current.lines.push({ type: "context", text: line.slice(1) })
    }
  }
  flush()
  return files
}

/** Format a DiffFile back to a unified diff string (used for patch display). */
export function formatDiff(files: DiffFile[]): string {
  const out: string[] = []
  for (const f of files) {
    out.push(`--- ${f.oldName || f.newName}`)
    out.push(`+++ ${f.newName}`)
    out.push(`@@ -1,${f.lines.filter((l) => l.type !== "add").length} +1,${f.lines.filter((l) => l.type !== "remove").length} @@`)
    for (const l of f.lines) {
      if (l.type === "add") out.push(`+${l.text}`)
      else if (l.type === "remove") out.push(`-${l.text}`)
      else out.push(` ${l.text}`)
    }
  }
  return out.join("\n")
}
