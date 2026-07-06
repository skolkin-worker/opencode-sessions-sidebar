/** @jsxImportSource @opentui/solid */

import type { JSX } from "@opentui/solid"
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiSlotContext,
  TuiSlotPlugin,
  TuiPluginModule,
  TuiThemeCurrent,
} from "@opencode-ai/plugin/tui"
import type { Session, SessionStatus } from "@opencode-ai/sdk/v2"
import { createMemo, createSignal, onMount, onCleanup, Show, For } from "solid-js"
import { PLUGIN_VERSION } from "./_version"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function charColumns(c: string): number {
  const code = c.codePointAt(0) ?? 0
  if (code < 0x20) return 0
  if (code < 0x7F) return 1
  if (code < 0xA0) return 0
  if ((code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0xA4CF) ||
      (code >= 0xAC00 && code <= 0xD7A3) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFE10 && code <= 0xFE6F) ||
      (code >= 0xFF01 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6) ||
      (code >= 0x1F300 && code <= 0x1F64F) ||
      (code >= 0x20000 && code <= 0x3FFFD))
    return 2
  return 1
}

function visualWidth(s: string): number {
  let w = 0; for (const c of s) w += charColumns(c); return w
}

function truncateVisual(s: string, maxCols: number): string {
  if (visualWidth(s) <= maxCols) return s
  let result = "", w = 0
  for (const c of s) {
    const cw = charColumns(c)
    if (w + cw > maxCols - 1) { result += "\u2026"; break }
    result += c; w += cw
  }
  return result
}

function normalizePath(p: string | undefined): string {
  if (!p) return ""
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
}

function rgb(raw: unknown): { r: number; g: number; b: number } | null {
  if (typeof raw === "string" && raw.startsWith("#")) {
    const h = raw.slice(1)
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    }
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>
    if (typeof o.r === "number" && typeof o.g === "number" && typeof o.b === "number") {
      const scale = o.r > 1 || o.g > 1 || o.b > 1 ? 1 : 255
      return {
        r: Math.round(o.r * scale),
        g: Math.round(o.g * scale),
        b: Math.round(o.b * scale),
      }
    }
  }
  return null
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const delta = max - min
  if (delta === 0) return 0
  const L = (max + min) / 2
  return L <= 0.5 ? delta / (max + min) : delta / (2 - max - min)
}

function desaturateTo(raw: unknown, maxSat: number, fallback: string): string {
  const c = rgb(raw)
  if (!c) return fallback
  const sat = saturation(c.r, c.g, c.b)
  if (sat <= maxSat) {
    return "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")
  }
  const luma = c.r * 0.299 + c.g * 0.587 + c.b * 0.114
  let lo = 0, hi = 1
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2
    const nr = Math.round(c.r + (luma - c.r) * mid)
    const ng = Math.round(c.g + (luma - c.g) * mid)
    const nb = Math.round(c.b + (luma - c.b) * mid)
    if (saturation(nr, ng, nb) > maxSat) lo = mid
    else hi = mid
  }
  const nr = Math.round(c.r + (luma - c.r) * hi)
  const ng = Math.round(c.g + (luma - c.g) * hi)
  const nb = Math.round(c.b + (luma - c.b) * hi)
  return "#" + [nr, ng, nb].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")
}

const FALLBACK = {
  primary: "#8B9DAF",
  text:    "#C5C5BB",
  muted:   "#7A7A72",
  border:  "#6B6B63",
} as const

const MAX_SAT = 0.28

const MIN_PANEL_WIDTH = 20
const DEFAULT_PANEL_WIDTH = 26
const DEFAULT_MAX_SESSIONS = 10
const KV_PREFIX = "sessions_panel"

const SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"]

// ---------------------------------------------------------------------------
// Session list panel component
// ---------------------------------------------------------------------------

function SessionsPanel(props: {
  theme: TuiThemeCurrent
  api: TuiPluginApi
  sessionId: string
  maxSessions: () => number
}): JSX.Element {
  const [panelWidth, setPanelWidth] = createSignal(DEFAULT_PANEL_WIDTH)
  const [open, setOpen] = createSignal(true)
  const [sessions, setSessions] = createSignal<Session[]>([])
  const [loading, setLoading] = createSignal(true)
  const [spinnerIdx, setSpinnerIdx] = createSignal(0)
  const [statusTick, setStatusTick] = createSignal(0)
  let boxEl: any

  const fetchSessions = async () => {
    try {
      const dir = props.api.state.path.directory
      const result = await props.api.client.session.list({
        limit: props.maxSessions(),
        scope: "project",
        directory: dir,
      })
      if (result.data && Array.isArray(result.data)) {
        const normDir = normalizePath(dir)
        const filtered = normDir
          ? result.data.filter((s) => normalizePath(s.directory) === normDir)
          : result.data
        const sorted = [...filtered].sort(
          (a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0)
        )
        setSessions(sorted.slice(0, props.maxSessions()))
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
    setPanelWidth(DEFAULT_PANEL_WIDTH)

    try {
      setOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.open`, true)))
    } catch {}

    fetchSessions()

    // spinner animation — updates every 80ms for smooth braille spinner
    const spinnerInterval = setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % SPINNER_FRAMES.length)
    }, 80)

    const unsubCreated = props.api.event.on("session.created", debouncedFetch)
    const unsubUpdated = props.api.event.on("session.updated", debouncedFetch)
    const unsubDeleted = props.api.event.on("session.deleted", debouncedFetch)
    const unsubStatus = props.api.event.on("session.status", () => { setStatusTick((t) => t + 1) })
    const unsubIdle = props.api.event.on("session.idle", () => { setStatusTick((t) => t + 1) })

    onCleanup(() => {
      clearInterval(spinnerInterval)
      clearTimeout(fetchTimer)
      unsubCreated()
      unsubUpdated()
      unsubDeleted()
      unsubStatus()
      unsubIdle()
    })
  })

  const pal = createMemo(() => {
    const t = props.theme as Record<string, unknown>
    const sat = (k: string, fb: string) => desaturateTo(t[k], MAX_SAT, fb)
    return {
      primary: sat("primary",   FALLBACK.primary),
      text:    sat("text",      FALLBACK.text),
      muted:   sat("textMuted", FALLBACK.muted),
      border:  sat("border",    FALLBACK.border),
    }
  })

  const gutter = createMemo(() => 6)

  const sep = createMemo(() => "\u2500".repeat(Math.max(1, panelWidth() - gutter())))

  const displayTitle = (s: Session): string => {
    const title = s.title?.trim()
    if (title) return title
    return s.id.slice(0, 8)
  }

  const getSessionStatus = (sid: string): SessionStatus | undefined => {
    void statusTick()
    try {
      return props.api.state.session.status(sid)
    } catch {
      return undefined
    }
  }

  const isRunning = (sid: string): boolean => {
    const st = getSessionStatus(sid)
    return st?.type === "busy" || st?.type === "retry"
  }

  const switchToSession = (sid: string) => {
    if (sid === props.sessionId) return
    props.api.route.navigate("session", { sessionID: sid })
  }

  const itemPrefix = 2

  return (
    <box
      border={true}
      borderColor={pal().border}
      paddingTop={0}
      paddingBottom={0}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="column"
      gap={0}
      ref={boxEl}
      onSizeChange={() => {
        const w = boxEl ? Math.max(MIN_PANEL_WIDTH, boxEl.width ?? 0) : DEFAULT_PANEL_WIDTH
        setPanelWidth((prev) => (prev === w ? prev : w))
      }}
    >
      <text
        onMouseUp={() => {
          const n = !open()
          try { props.api.kv.set(`${KV_PREFIX}.open`, n) } catch {}
          setOpen(n)
        }}
      >
        <span style={{ fg: pal().muted }}>{open() ? "\u25bc " : "\u25b6 "}</span>
        <span style={{ fg: pal().primary }}>
          <b>Sessions</b>
        </span>
        <Show when={open()}>
          <span style={{ fg: pal().muted }}> ({sessions().length})</span>
        </Show>
      </text>

      <Show when={open()}>
        <text fg={pal().muted}>{sep()}</text>

        <Show
          when={!loading() || sessions().length > 0}
          fallback={
            <text>
              <span style={{ fg: pal().muted }}>{"> "}</span>
              <span style={{ fg: pal().muted }}>Loading...</span>
            </text>
          }
        >
          <Show
            when={sessions().length > 0}
            fallback={
              <text>
                <span style={{ fg: pal().muted }}>{"> "}</span>
                <span style={{ fg: pal().muted }}>No sessions yet</span>
              </text>
            }
          >
            <For each={sessions()}>
              {(s) => (
                <text onMouseUp={() => switchToSession(s.id)}>
                  <span style={{ fg: isRunning(s.id) || s.id === props.sessionId ? pal().primary : pal().muted }}>
                    {isRunning(s.id) ? SPINNER_FRAMES[spinnerIdx()] : s.id === props.sessionId ? "\u25b6" : " "}
                    {" "}
                  </span>
                  <span style={{ fg: s.id === props.sessionId ? pal().primary : pal().text }}>
                    {truncateVisual(displayTitle(s), panelWidth() - gutter() - itemPrefix)}
                  </span>
                </text>
              )}
            </For>
          </Show>
        </Show>
      </Show>
    </box>
  )
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

function createSidebarSlot(api: TuiPluginApi, maxSessionsSig: () => number): TuiSlotPlugin {
  return {
    order: 56,
    slots: {
      sidebar_content(ctx: TuiSlotContext, input: { session_id: string }): JSX.Element {
        return (
          <SessionsPanel
            theme={ctx.theme.current}
            api={api}
            sessionId={input.session_id}
            maxSessions={maxSessionsSig}
          />
        )
      },
    },
  }
}

const tui: TuiPlugin = async (api: TuiPluginApi) => {
  const [maxSessions, setMaxSessions] = createSignal(DEFAULT_MAX_SESSIONS)

  try {
    const saved = api.kv.get<number>(`${KV_PREFIX}.maxSessions`)
    if (typeof saved === "number" && saved > 0) setMaxSessions(saved)
  } catch {}

  api.slots.register(createSidebarSlot(api, maxSessions))

  api.command?.register(() => [
    {
      title: "Sessions: Refresh",
      value: "sessions.refresh",
      description: "Refresh the sessions sidebar list",
      slash: { name: "sessions-refresh" },
      onSelect: () => {
        api.ui.toast({ message: "Sessions list refreshed" })
      },
    },
    {
      title: "Sessions: Set Max Count",
      value: "sessions.count",
      description: "Set the maximum number of sessions to display",
      slash: { name: "sessions-count" },
      onSelect: (dialog) => {
        dialog?.replace(() => (
          <api.ui.DialogPrompt
            title="Max Sessions"
            description={() => <text>Enter the maximum number of sessions to display (1-100)</text>}
            placeholder="20"
            value={String(api.kv.get<number>(`${KV_PREFIX}.maxSessions`, DEFAULT_MAX_SESSIONS))}
            onConfirm={(val) => {
              const n = parseInt(val, 10)
              if (n > 0 && n <= 100) {
                api.kv.set(`${KV_PREFIX}.maxSessions`, n)
                setMaxSessions(n)
                api.ui.toast({ message: `Max sessions set to ${n}` })
              } else {
                api.ui.toast({ message: "Invalid value (1-100)", variant: "warning" })
              }
              dialog?.clear()
            }}
          />
        ))
      },
    },
  ])
}

const mod: TuiPluginModule & { id: string } = {
  id: "opencode-sessions-sidebar",
  tui,
}

export default mod
