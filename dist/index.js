import { jsx as _jsx, jsxs as _jsxs } from "@opentui/solid/jsx-runtime";
import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
function normalizePath(p) {
    if (!p)
        return "";
    return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
const DEFAULT_MAX_SESSIONS = 10;
const KV_PREFIX = "sessions_panel";
const SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
function SessionsPanel(props) {
    const theme = () => props.api.theme.current;
    const [open, setOpen] = createSignal(true);
    const [sessions, setSessions] = createSignal([]);
    const [loading, setLoading] = createSignal(true);
    const [spinnerIdx, setSpinnerIdx] = createSignal(0);
    const [statusTick, setStatusTick] = createSignal(0);
    const fetchSessions = async () => {
        try {
            const dir = props.api.state.path.directory;
            const result = await props.api.client.session.list({
                limit: props.maxSessions(),
                scope: "project",
                directory: dir,
            });
            if (result.data && Array.isArray(result.data)) {
                const normDir = normalizePath(dir);
                const filtered = normDir
                    ? result.data.filter((s) => normalizePath(s.directory) === normDir)
                    : result.data;
                const sorted = [...filtered].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
                setSessions(sorted.slice(0, props.maxSessions()));
                setStatusTick((t) => t + 1);
            }
        }
        catch {
            // network or server error — keep stale data
        }
        finally {
            setLoading(false);
        }
    };
    let fetchTimer;
    const debouncedFetch = () => {
        clearTimeout(fetchTimer);
        fetchTimer = setTimeout(() => { void fetchSessions(); }, 200);
    };
    onMount(() => {
        try {
            setOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.open`, true)));
        }
        catch { }
        fetchSessions();
        const spinnerInterval = setInterval(() => {
            setSpinnerIdx((i) => (i + 1) % SPINNER_FRAMES.length);
        }, 80);
        const unsubCreated = props.api.event.on("session.created", debouncedFetch);
        const unsubUpdated = props.api.event.on("session.updated", debouncedFetch);
        const unsubDeleted = props.api.event.on("session.deleted", debouncedFetch);
        const unsubStatus = props.api.event.on("session.status", () => { setStatusTick((t) => t + 1); });
        const unsubIdle = props.api.event.on("session.idle", () => { setStatusTick((t) => t + 1); });
        onCleanup(() => {
            clearInterval(spinnerInterval);
            clearTimeout(fetchTimer);
            unsubCreated();
            unsubUpdated();
            unsubDeleted();
            unsubStatus();
            unsubIdle();
        });
    });
    const displayTitle = (s) => {
        const title = s.title?.trim();
        if (title)
            return title;
        return s.id.slice(0, 8);
    };
    const getSessionStatus = (sid) => {
        void statusTick();
        try {
            return props.api.state.session.status(sid);
        }
        catch {
            return undefined;
        }
    };
    const isRunning = (sid) => {
        const st = getSessionStatus(sid);
        return st?.type === "busy" || st?.type === "retry";
    };
    const switchToSession = (sid) => {
        if (sid === props.sessionId)
            return;
        props.api.route.navigate("session", { sessionID: sid });
    };
    const bullet = (s) => {
        if (isRunning(s.id))
            return { char: SPINNER_FRAMES[spinnerIdx()], color: theme().primary };
        if (s.id === props.sessionId)
            return { char: "\u2022", color: theme().success };
        return { char: "\u2022", color: theme().textMuted };
    };
    return (_jsxs("box", { children: [_jsxs("box", { flexDirection: "row", gap: 1, onMouseUp: () => {
                    const n = !open();
                    try {
                        props.api.kv.set(`${KV_PREFIX}.open`, n);
                    }
                    catch { }
                    setOpen(n);
                }, children: [_jsx("text", { style: { fg: theme().text }, children: open() ? "\u25BC" : "\u25B6" }), _jsxs("text", { style: { fg: theme().text }, children: [_jsx("b", { children: "Sessions" }), _jsx(Show, { when: !open() && sessions().length > 0, children: _jsxs("span", { style: { fg: theme().textMuted }, children: [" (", sessions().length, ")"] }) })] })] }), _jsx(Show, { when: open(), children: _jsx(Show, { when: !loading(), fallback: _jsx("text", { style: { fg: theme().textMuted }, children: "Loading..." }), children: _jsx(Show, { when: sessions().length > 0, fallback: _jsx("text", { style: { fg: theme().textMuted }, children: "No sessions yet" }), children: _jsx(For, { each: sessions(), children: (s) => (_jsxs("box", { flexDirection: "row", gap: 1, onMouseUp: () => switchToSession(s.id), children: [_jsx("text", { flexShrink: 0, style: { fg: bullet(s).color }, children: bullet(s).char }), _jsx("text", { style: { fg: s.id === props.sessionId ? theme().text : theme().textMuted }, wrapMode: "word", children: displayTitle(s) })] })) }) }) }) })] }));
}
function createSidebarSlot(api, maxSessionsSig) {
    return {
        order: 56,
        slots: {
            sidebar_content(ctx, input) {
                return (_jsx(SessionsPanel, { api: api, sessionId: input.session_id, maxSessions: maxSessionsSig }));
            },
        },
    };
}
const tui = async (api) => {
    const [maxSessions, setMaxSessions] = createSignal(DEFAULT_MAX_SESSIONS);
    try {
        const saved = api.kv.get(`${KV_PREFIX}.maxSessions`);
        if (typeof saved === "number" && saved > 0)
            setMaxSessions(saved);
    }
    catch { }
    api.slots.register(createSidebarSlot(api, maxSessions));
    api.command?.register(() => [
        {
            title: "Sessions: Refresh",
            value: "sessions.refresh",
            description: "Refresh the sessions sidebar list",
            slash: { name: "sessions-refresh" },
            onSelect: () => {
                api.ui.toast({ message: "Sessions list refreshed" });
            },
        },
        {
            title: "Sessions: Set Max Count",
            value: "sessions.count",
            description: "Set the maximum number of sessions to display",
            slash: { name: "sessions-count" },
            onSelect: (dialog) => {
                dialog?.replace(() => (_jsx(api.ui.DialogPrompt, { title: "Max Sessions", description: () => _jsx("text", { children: "Enter the maximum number of sessions to display (1-100)" }), placeholder: "20", value: String(api.kv.get(`${KV_PREFIX}.maxSessions`, DEFAULT_MAX_SESSIONS)), onConfirm: (val) => {
                        const n = parseInt(val, 10);
                        if (n > 0 && n <= 100) {
                            api.kv.set(`${KV_PREFIX}.maxSessions`, n);
                            setMaxSessions(n);
                            api.ui.toast({ message: `Max sessions set to ${n}` });
                        }
                        else {
                            api.ui.toast({ message: "Invalid value (1-100)", variant: "warning" });
                        }
                        dialog?.clear();
                    } })));
            },
        },
    ]);
};
const mod = {
    id: "opencode-sessions-sidebar",
    tui,
};
export default mod;
