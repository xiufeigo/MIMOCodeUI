import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"

// Tauri expects a fixed dev port; keep it in sync with src-tauri/tauri.conf.json
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  // Prevent Vite from obscuring Rust errors
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Ignore Rust sources to avoid full reloads on cargo builds
      ignored: ["**/src-tauri/**"],
    },
  },
  // Env variables starting with TAURI_* are exposed to the client unless prefixed with VITE_
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
})
