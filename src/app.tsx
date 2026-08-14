import { createSignal } from "solid-js"
import { AppProvider } from "./lib/store/provider"
import { SettingsProvider } from "./lib/settings/store"
import { SessionPreferencesProvider } from "./lib/session-preferences"
import { SessionArchiveProvider } from "./lib/session-archive"
import { WorkspacePage } from "./routes/workspace"

/**
 * Top-level view. The workspace is ALWAYS shown (opencode-style): the provider
 * auto-connects on startup, and while disconnected the workspace renders an
 * unconnected state with a settings entry.
 */
function Root() {
  const [activeSession, setActiveSession] = createSignal<string | null>(null)

  return <WorkspacePage activeSession={activeSession()} onOpenSession={setActiveSession} />
}

export function App() {
  return (
    <AppProvider>
      <SettingsProvider>
        <SessionPreferencesProvider>
          <SessionArchiveProvider>
            <Root />
          </SessionArchiveProvider>
        </SessionPreferencesProvider>
      </SettingsProvider>
    </AppProvider>
  )
}
