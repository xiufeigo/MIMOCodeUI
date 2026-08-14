import { invoke } from "@tauri-apps/api/core"
import type { ServerProfile } from "./server-profiles"

export interface DirectoryEntry {
  name: string
  path: string
}

export interface DirectoryListing {
  path: string
  parent?: string
  directories: DirectoryEntry[]
}

export function isLocalDirectoryProfile(profile: ServerProfile): boolean {
  return profile.mode === "local"
}

export async function authorizeLocalDirectory(path: string): Promise<DirectoryListing> {
  return invoke<DirectoryListing>("authorize_local_directory", { path })
}

export async function listLocalDirectories(path: string): Promise<DirectoryListing> {
  return invoke<DirectoryListing>("list_local_directories", { path })
}

export async function completeLocalDirectories(path: string): Promise<DirectoryEntry[]> {
  return invoke<DirectoryEntry[]>("complete_local_directories", { path })
}

export async function validateDirectory(profile: ServerProfile, path: string): Promise<string | undefined> {
  const value = path.trim()
  if (!value) return undefined
  if (!isLocalDirectoryProfile(profile)) return value
  return invoke<string>("validate_local_directory", { path: value })
}
