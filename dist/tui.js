// src/index.tsx
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
function normalizePath(p) {
  if (!p) return "";
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
var DEFAULT_MAX_SESSIONS = 10;
var KV_PREFIX = "sessions_panel";
var SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
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
        directory: dir
      });
      if (result.data && Array.isArray(result.data)) {
        const normDir = normalizePath(dir);
        const filtered = normDir ? result.data.filter((s) => normalizePath(s.directory) === normDir) : result.data;
        const sorted = [...filtered].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
        setSessions(sorted.slice(0, props.maxSessions()));
        setStatusTick((t) => t + 1);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };
  let fetchTimer;
  const debouncedFetch = () => {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => {
      void fetchSessions();
    }, 200);
  };
  onMount(() => {
    try {
      setOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.open`, true)));
    } catch {
    }
    fetchSessions();
    const spinnerInterval = setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % SPINNER_FRAMES.length);
    }, 80);
    const unsubCreated = props.api.event.on("session.created", debouncedFetch);
    const unsubUpdated = props.api.event.on("session.updated", debouncedFetch);
    const unsubDeleted = props.api.event.on("session.deleted", debouncedFetch);
    const unsubStatus = props.api.event.on("session.status", () => {
      setStatusTick((t) => t + 1);
    });
    const unsubIdle = props.api.event.on("session.idle", () => {
      setStatusTick((t) => t + 1);
    });
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
    if (title) return title;
    return s.id.slice(0, 8);
  };
  const getSessionStatus = (sid) => {
    void statusTick();
    try {
      return props.api.state.session.status(sid);
    } catch {
      return void 0;
    }
  };
  const isRunning = (sid) => {
    const st = getSessionStatus(sid);
    return st?.type === "busy" || st?.type === "retry";
  };
  const switchToSession = (sid) => {
    if (sid === props.sessionId) return;
    props.api.route.navigate("session", {
      sessionID: sid
    });
  };
  const bullet = (s) => {
    if (isRunning(s.id)) return {
      char: SPINNER_FRAMES[spinnerIdx()],
      color: theme().primary
    };
    if (s.id === props.sessionId) return {
      char: "\u2022",
      color: theme().success
    };
    return {
      char: "\u2022",
      color: theme().textMuted
    };
  };
  return (() => {
    var _el$ = _$createElement("box"), _el$2 = _$createElement("box"), _el$3 = _$createElement("text"), _el$4 = _$createElement("text"), _el$5 = _$createElement("b");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$4);
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "gap", 1);
    _$setProp(_el$2, "onMouseUp", () => {
      const n = !open();
      try {
        props.api.kv.set(`${KV_PREFIX}.open`, n);
      } catch {
      }
      setOpen(n);
    });
    _$insert(_el$3, () => open() ? "\u25BC" : "\u25B6");
    _$insertNode(_el$4, _el$5);
    _$insertNode(_el$5, _$createTextNode(`Sessions`));
    _$insert(_el$4, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!!open())() && sessions().length > 0;
      },
      get children() {
        var _el$7 = _$createElement("span"), _el$8 = _$createTextNode(` (`), _el$9 = _$createTextNode(`)`);
        _$insertNode(_el$7, _el$8);
        _$insertNode(_el$7, _el$9);
        _$insert(_el$7, () => sessions().length, _el$9);
        _$effect((_$p) => _$setProp(_el$7, "style", {
          fg: theme().textMuted
        }, _$p));
        return _el$7;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return open();
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return !loading();
          },
          get fallback() {
            return (() => {
              var _el$0 = _$createElement("text");
              _$insertNode(_el$0, _$createTextNode(`Loading...`));
              _$effect((_$p) => _$setProp(_el$0, "style", {
                fg: theme().textMuted
              }, _$p));
              return _el$0;
            })();
          },
          get children() {
            return _$createComponent(Show, {
              get when() {
                return sessions().length > 0;
              },
              get fallback() {
                return (() => {
                  var _el$10 = _$createElement("text");
                  _$insertNode(_el$10, _$createTextNode(`No sessions yet`));
                  _$effect((_$p) => _$setProp(_el$10, "style", {
                    fg: theme().textMuted
                  }, _$p));
                  return _el$10;
                })();
              },
              get children() {
                return _$createComponent(For, {
                  get each() {
                    return sessions();
                  },
                  children: (s) => (() => {
                    var _el$12 = _$createElement("box"), _el$13 = _$createElement("text"), _el$14 = _$createElement("text");
                    _$insertNode(_el$12, _el$13);
                    _$insertNode(_el$12, _el$14);
                    _$setProp(_el$12, "flexDirection", "row");
                    _$setProp(_el$12, "gap", 1);
                    _$setProp(_el$12, "onMouseUp", () => switchToSession(s.id));
                    _$setProp(_el$13, "flexShrink", 0);
                    _$insert(_el$13, () => bullet(s).char);
                    _$setProp(_el$14, "wrapMode", "word");
                    _$insert(_el$14, () => displayTitle(s));
                    _$effect((_p$) => {
                      var _v$3 = {
                        fg: bullet(s).color
                      }, _v$4 = {
                        fg: s.id === props.sessionId ? theme().text : theme().textMuted
                      };
                      _v$3 !== _p$.e && (_p$.e = _$setProp(_el$13, "style", _v$3, _p$.e));
                      _v$4 !== _p$.t && (_p$.t = _$setProp(_el$14, "style", _v$4, _p$.t));
                      return _p$;
                    }, {
                      e: void 0,
                      t: void 0
                    });
                    return _el$12;
                  })()
                });
              }
            });
          }
        });
      }
    }), null);
    _$effect((_p$) => {
      var _v$ = {
        fg: theme().text
      }, _v$2 = {
        fg: theme().text
      };
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$3, "style", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$4, "style", _v$2, _p$.t));
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$;
  })();
}
function createSidebarSlot(api, maxSessionsSig) {
  return {
    order: 56,
    slots: {
      sidebar_content(ctx, input) {
        return _$createComponent(SessionsPanel, {
          api,
          get sessionId() {
            return input.session_id;
          },
          maxSessions: maxSessionsSig
        });
      }
    }
  };
}
var tui = async (api) => {
  const [maxSessions, setMaxSessions] = createSignal(DEFAULT_MAX_SESSIONS);
  try {
    const saved = api.kv.get(`${KV_PREFIX}.maxSessions`);
    if (typeof saved === "number" && saved > 0) setMaxSessions(saved);
  } catch {
  }
  api.slots.register(createSidebarSlot(api, maxSessions));
  api.command?.register(() => [{
    title: "Sessions: Refresh",
    value: "sessions.refresh",
    description: "Refresh the sessions sidebar list",
    slash: {
      name: "sessions-refresh"
    },
    onSelect: () => {
      api.ui.toast({
        message: "Sessions list refreshed"
      });
    }
  }, {
    title: "Sessions: Set Max Count",
    value: "sessions.count",
    description: "Set the maximum number of sessions to display",
    slash: {
      name: "sessions-count"
    },
    onSelect: (dialog) => {
      dialog?.replace(() => _$createComponent(api.ui.DialogPrompt, {
        title: "Max Sessions",
        description: () => (() => {
          var _el$15 = _$createElement("text");
          _$insertNode(_el$15, _$createTextNode(`Enter the maximum number of sessions to display (1-100)`));
          return _el$15;
        })(),
        placeholder: "20",
        get value() {
          return String(api.kv.get(`${KV_PREFIX}.maxSessions`, DEFAULT_MAX_SESSIONS));
        },
        onConfirm: (val) => {
          const n = parseInt(val, 10);
          if (n > 0 && n <= 100) {
            api.kv.set(`${KV_PREFIX}.maxSessions`, n);
            setMaxSessions(n);
            api.ui.toast({
              message: `Max sessions set to ${n}`
            });
          } else {
            api.ui.toast({
              message: "Invalid value (1-100)",
              variant: "warning"
            });
          }
          dialog?.clear();
        }
      }));
    }
  }]);
};
var mod = {
  id: "opencode-sessions-sidebar",
  tui
};
var index_default = mod;
export {
  index_default as default
};
