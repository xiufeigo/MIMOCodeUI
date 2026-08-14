import { open } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"

export function isTauriEnv(): boolean {
  return typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined"
}

/** 打开系统文件选择对话框，返回选中的文件绝对路径（多选）。 */
export async function pickFiles(): Promise<string[]> {
  const selected = await open({ multiple: true, directory: false, title: "选择文件" })
  if (typeof selected === "string") return [selected]
  if (Array.isArray(selected)) return selected
  return []
}

/** 读取本地文件内容为 base64（用于图片 data URL）。 */
export async function readFileBase64(path: string): Promise<string> {
  return invoke<string>("fs_read_file_base64", { path })
}
