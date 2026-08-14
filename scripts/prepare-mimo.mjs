#!/usr/bin/env node
// Copies the MiMo native binary from the global npm install into
// src-tauri/resources/ so the desktop bundle can ship it as an externalBin
// style resource. Falls back silently to the system `mimo` when not found.
//
// Usage: node scripts/prepare-mimo.mjs

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const destDir = join(root, "src-tauri", "resources")
const dest = join(destDir, "mimo.exe")

function findBinary() {
  const platforms = {
    win32: { pkg: "@mimo-ai/mimocode-windows-x64", bin: "mimo.exe" },
    linux: { pkg: "@mimo-ai/mimocode-linux-x64", bin: "mimo" },
    darwin: { pkg: "@mimo-ai/mimocode-darwin-arm64", bin: "mimo" },
  }
  const plat = platforms[process.platform]
  if (!plat) return null
  try {
    const npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim()
    const candidate = join(npmRoot, plat.pkg, "bin", plat.bin)
    return existsSync(candidate) ? candidate : null
  } catch {
    return null
  }
}

const src = findBinary()
if (!src) {
  console.log("[prepare-mimo] native binary not found; will fall back to system `mimo`")
  writeFileSync(join(destDir, "VERSION"), "system\n")
  process.exit(0)
}
mkdirSync(destDir, { recursive: true })
copyFileSync(src, dest)
writeFileSync(join(destDir, "VERSION"), "bundled\n")
console.log(`[prepare-mimo] bundled ${src} -> ${dest}`)
