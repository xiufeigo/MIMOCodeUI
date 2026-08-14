// Prompt attachment/part helpers. Aligned with MiMo-Code's SDK part schema
// (XiaomiMiMo/MiMo-Code `packages/sdk/openapi.json`): a file part carries
// `type:"file"`, `mime`, `url`, and optional `filename`. Images use a base64
// data URL in `url`; ordinary files use a `file://` URL.

export interface PromptTextPart {
  type: "text"
  text: string
}

export interface PromptFilePart {
  type: "file"
  mime: string
  url: string
  filename?: string
}

export type PromptPart = PromptTextPart | PromptFilePart

export const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
}

export const IMAGE_MIMES = new Set(Object.values(IMAGE_MIME_EXTENSIONS))

/** Map a file path to a MIME type by extension; unknown falls back to octet-stream. */
export function mimeForPath(path: string): string {
  const dot = path.lastIndexOf(".")
  if (dot < 0) return "application/octet-stream"
  const ext = path.slice(dot).toLowerCase()
  return IMAGE_MIME_EXTENSIONS[ext] ?? textMimeForExtension(ext)
}

function textMimeForExtension(ext: string): string {
  switch (ext) {
    case ".md":
    case ".txt":
      return "text/plain"
    case ".json":
      return "application/json"
    case ".js":
    case ".mjs":
      return "text/javascript"
    case ".ts":
      return "text/typescript"
    case ".tsx":
    case ".jsx":
      return "text/plain"
    case ".css":
      return "text/css"
    case ".html":
      return "text/html"
    case ".csv":
      return "text/csv"
    case ".pdf":
      return "application/pdf"
    default:
      return "application/octet-stream"
  }
}

export function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime)
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : path
}

/** Windows-safe `file://` URL for a local absolute path. */
export function fileUrlForPath(path: string): string {
  const normalized = path.replace(/\\/g, "/")
  return `file://${normalized}`
}

/** Build a base64 data URL for a file part. */
export function dataUrlForImage(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`
}
