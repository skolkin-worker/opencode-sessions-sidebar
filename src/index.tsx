/** @jsxImportSource @opentui/solid */

import { Plugin } from "@opencode/plugin/tui"
import type { JSX } from "@opentui/solid"
import type { RGBA } from "@opentui/core"
import { createSignal, createEffect, onMount, onCleanup, Show, For } from "solid-js"

type TuiContext = Parameters<Plugin.Definition["setup"]>[0]
type SessionEntry = Awaited<ReturnType<TuiContext["client"]["session"]["list"]>>["data"][number]

type PanelState = {
  open: boolean
  maxSessions: number
}

function normalizePath(p: string | undefined): string {
  if (!p) return ""
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
}

const DEFAULT_MAX_SESSIONS = 10

const SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"]

function SessionsPanel(props: {
  context: TuiContext
  sessionId: string
  state: PanelState
  updateState: (mutation: (draft: PanelState) => void) => Promise<void>
  refreshTick: () => number
}): JSX.Element {
  const theme = props.context.theme
  const [sessions, setSessions] = createSignal<SessionEntry[]>([])
  const [loading, setLoading] = createSignal(true)
  const [spinnerIdx, setSpinnerIdx] = createSignal(0)
  const [statusTick, setStatusTick] = createSignal(0)
  const running = new Set<string>()

  const fetchSessions = async () => {
    try {
      const dir = props.context.location?.directory ?? props.context.data.location.default().directory
      const result = await props.context.client.session.list({
        limit: 100,
        directory: dir,
      })
      if (result.data && Array.isArray(result.data)) {
        const normDir = normalizePath(dir)
        const inDir = normDir
          ? result.data.filter((s) => normalizePath(s.location?.directory) === normDir)
          : result.data
        const filtered = inDir.filter((s) => !s.parentID)
        const sorted = [...filtered].sort(
          (a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0)
        )
        setSessions(sorted.slice(0, props.state.maxSessions))
        setStatusTick((t) => t + 1)
      }
    } catch {
      // network or server error — keep stale data
    } finally {
      setLoading(false)
    }
  }

  let fetchTimer: ReturnType<typeof setTimeout> | undefined
  const debouncedFetch = () => {
    clearTimeout(fetchTimer)
    fetchTimer = setTimeout(() => { void fetchSessions() }, 200)
  }

  onMount(() => {
    fetchSessions()

    const spinnerInterval = setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % SPINNER_FRAMES.length)
    }, 80)

    const unsubscribers = [
      props.context.data.on("session.created", debouncedFetch),
      props.context.data.on("session.deleted", debouncedFetch),
      props.context.data.on("session.renamed", debouncedFetch),
      props.context.data.on("session.metadata.updated", debouncedFetch),
      props.context.data.on("session.execution.started", (event) => {
        running.add(event.data.sessionID)
        setStatusTick((t) => t + 1)
      }),
      props.context.data.on("session.execution.succeeded", (event) => {
        running.delete(event.data.sessionID)
        setStatusTick((t) => t + 1)
      }),
      props.context.data.on("session.execution.failed", (event) => {
        running.delete(event.data.sessionID)
        setStatusTick((t) => t + 1)
      }),
      props.context.data.on("session.execution.interrupted", (event) => {
        running.delete(event.data.sessionID)
        setStatusTick((t) => t + 1)
      }),
    ]

    onCleanup(() => {
      clearInterval(spinnerInterval)
      clearTimeout(fetchTimer)
      for (const unsubscribe of unsubscribers) unsubscribe()
    })
  })

  createEffect(() => {
    if (props.refreshTick() > 0) void fetchSessions()
  })

  const displayTitle = (s: SessionEntry): string => {
    const title = s.title?.trim()
    if (title) return title
    return s.id.slice(0, 8)
  }

  const isRunning = (sid: string): boolean => {
    void statusTick()
    if (running.has(sid)) return true
    try {
      return props.context.data.session.status(sid) === "running"
    } catch {
      return false
    }
  }

  const switchToSession = (sid: string) => {
    if (sid === props.sessionId) return
    props.context.ui.router.navigate({ type: "session", sessionID: sid })
  }

  const bullet = (s: SessionEntry): { char: string; color: RGBA } => {
    if (isRunning(s.id)) return { char: SPINNER_FRAMES[spinnerIdx()], color: theme.text.action.primary.base }
    if (s.id === props.sessionId) return { char: "\u2022", color: theme.text.feedback.success.base }
    return { char: "\u2022", color: theme.text.muted }
  }

  const toggleOpen = () => {
    void props.updateState((draft) => {
      draft.open = !draft.open
    })
  }

  return (
    <box>
      <box
        flexDirection="row"
        gap={1}
        onMouseUp={() => toggleOpen()}
      >
        <text style={{ fg: theme.text.base }}>{props.state.open ? "\u25BC" : "\u25B6"}</text>
        <text style={{ fg: theme.text.base }}>
          <b>Sessions</b>
          <Show when={!props.state.open && sessions().length > 0}>
            <span style={{ fg: theme.text.muted }}> ({sessions().length})</span>
          </Show>
        </text>
      </box>
      <Show when={props.state.open}>
        <Show
          when={!loading()}
          fallback={<text style={{ fg: theme.text.muted }}>Loading...</text>}
        >
          <Show
            when={sessions().length > 0}
            fallback={<text style={{ fg: theme.text.muted }}>No sessions yet</text>}
          >
            <For each={sessions()}>
              {(s) => (
                <box flexDirection="row" gap={1} onMouseUp={() => switchToSession(s.id)}>
                  <text
                    flexShrink={0}
                    style={{ fg: bullet(s).color }}
                  >
                    {bullet(s).char}
                  </text>
                  <text
                    style={{ fg: s.id === props.sessionId ? theme.text.base : theme.text.muted }}
                    wrapMode="word"
                  >
                    {displayTitle(s)}
                  </text>
                </box>
              )}
            </For>
          </Show>
        </Show>
      </Show>
    </box>
  )
}

export default Plugin.define({
  id: "opencode-sessions-sidebar",
  setup(context) {
    const [state, updateState] = context.storage.store<PanelState>("sessions_panel", {
      initial: { open: true, maxSessions: DEFAULT_MAX_SESSIONS },
    })

    const [refreshTick, bumpRefresh] = createSignal(0)

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "sessions.refresh",
          title: "Sessions: Refresh",
          description: "Refresh the sessions sidebar list",
          group: "Sessions",
          slash: { name: "sessions-refresh" },
          run: () => {
            bumpRefresh((t) => t + 1)
            context.ui.toast.show({ message: "Sessions list refreshed" })
          },
        },
        {
          id: "sessions.count",
          title: "Sessions: Set Max Count",
          description: "Set the maximum number of sessions to display",
          group: "Sessions",
          slash: { name: "sessions-count" },
          run: async () => {
            const value = await context.ui.dialog.prompt({
              title: "Max Sessions",
              description: "Enter the maximum number of sessions to display (1-100)",
              placeholder: String(DEFAULT_MAX_SESSIONS),
              value: String(state.maxSessions),
            })
            if (value === undefined) return
            const n = parseInt(value, 10)
            if (n > 0 && n <= 100) {
              await updateState((draft) => {
                draft.maxSessions = n
              })
              context.ui.toast.show({ message: `Max sessions set to ${n}` })
            } else {
              context.ui.toast.show({ message: "Invalid value (1-100)", variant: "warning" })
            }
          },
        },
      ],
    }))

    const unregisterSlot = context.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => (
        <SessionsPanel
          context={context}
          sessionId={sessionID}
          state={state}
          updateState={updateState}
          refreshTick={refreshTick}
        />
      ),
    })

    return () => {
      unregisterSlot()
    }
  },
})
