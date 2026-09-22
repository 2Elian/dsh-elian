window.__ModuleLoader__.load({ id: "@2elian/dsh-client-ui-session-list", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// ../../packages/session/delta-search/lib/anchors.js
var CHAT_CONTEXT_KIND = {
  /** `conversation-nodes/message.ts` — id is the message id. */
  inputMessage: "input-message",
  /** `conversation-nodes/assistant.ts` — id is `turn:step`. */
  assistantStep: "assistant-step",
  /** `conversation-nodes/tool.ts` — id is the tool call id. */
  toolCall: "tool-call",
  /** `conversation-nodes/turn-tail.ts` — id is the turn number. */
  turnTail: "turn-tail",
  /** `conversation-nodes/request-prompt.ts` — id is the event seq. */
  systemMessage: "system-message"
};
function conversationContextKey(kind, id) {
  return `${kind.length}:${kind}${id}`;
}
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function stringOf(value) {
  return typeof value === "string" && value !== "" ? value : void 0;
}
function numberOf(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function anchorKeysForEvent(event) {
  const data = record(event.data);
  switch (event.type) {
    case "user/message": {
      const id = stringOf(data.id);
      return id === void 0 ? [] : [conversationContextKey(CHAT_CONTEXT_KIND.inputMessage, id)];
    }
    case "assistant/message": {
      const turn = numberOf(data.turn);
      const step = numberOf(data.step);
      return turn === void 0 || step === void 0 ? [] : [conversationContextKey(CHAT_CONTEXT_KIND.assistantStep, `${String(turn)}:${String(step)}`)];
    }
    case "tool/call": {
      const callId = stringOf(data.callId);
      return callId === void 0 ? [] : [conversationContextKey(CHAT_CONTEXT_KIND.toolCall, callId), `call:${callId}`];
    }
    case "tool/result": {
      const callId = stringOf(data.callId);
      return callId === void 0 ? [] : [conversationContextKey(CHAT_CONTEXT_KIND.toolCall, callId), `call:${callId}`];
    }
    case "system/message":
      return [conversationContextKey(CHAT_CONTEXT_KIND.systemMessage, String(event.seq))];
    case "turn/start": {
      const turn = numberOf(data.turn);
      return turn === void 0 ? [] : [conversationContextKey(CHAT_CONTEXT_KIND.turnTail, String(turn))];
    }
    default:
      return [];
  }
}

// ../../packages/session/delta-search/lib/turns.js
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function plainText(blocks, wanted) {
  if (!Array.isArray(blocks))
    return "";
  const parts = [];
  for (const raw of blocks) {
    if (!isRecord(raw))
      continue;
    if (typeof raw.text !== "string")
      continue;
    if (raw.type === wanted)
      parts.push(raw.text);
  }
  return parts.join("\n").trim();
}
function buildTurnItems(events) {
  const items = [];
  let current;
  for (const event of events) {
    const data = isRecord(event.data) ? event.data : {};
    switch (event.type) {
      case "turn/start": {
        const turn = typeof data.turn === "number" ? data.turn : void 0;
        if (turn === void 0)
          break;
        if (current !== void 0)
          items.push(current);
        current = { turn, seq: event.seq, time: event.time ?? 0, prompt: "", response: "", anchorKeys: anchorKeysForEvent(event) };
        break;
      }
      case "user/message": {
        if (current === void 0 || current.prompt !== "")
          break;
        if (!isRecord(data.source) || data.source.kind !== "user")
          break;
        current.prompt = plainText(data.content, "text");
        const keys = anchorKeysForEvent(event);
        if (keys.length > 0)
          current.anchorKeys = [...keys, ...current.anchorKeys];
        break;
      }
      case "assistant/message": {
        if (current === void 0)
          break;
        const message = isRecord(data.message) ? data.message : void 0;
        const body = plainText(message?.content, "text");
        if (body !== "")
          current.response = body;
        break;
      }
      default:
        break;
    }
  }
  if (current !== void 0)
    items.push(current);
  return items;
}
function preview(value, maxLength = 120) {
  const normalized = value.replaceAll(/\s+/gu, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}\u2026`;
}

// ../../packages/session/delta-search/lib/jump.js
var ROW_SELECTOR = "[data-chat-anchor-key]";
var SCROLLPORT_SELECTOR = "[data-conversation-scroll]";
var FLASH_OUTLINE = "2px solid var(--dsh-accent, #4c8dff)";
var DEFAULT_MAX_PAGES = 20;
var DEFAULT_FLASH_MS = 1400;
var LANDING_INSET = 24;
function ambientRoot() {
  return typeof document === "undefined" ? void 0 : document;
}
function isElement(node) {
  return node !== null && typeof node.style === "object";
}
function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function findAnchorRow(root, keys) {
  const wanted = new Set(keys);
  for (const node of Array.from(root.querySelectorAll(ROW_SELECTOR))) {
    const key = node.dataset?.chatAnchorKey;
    if (key !== void 0 && wanted.has(key) && isElement(node))
      return { row: node, key };
  }
  return void 0;
}
function revealAncestors(row) {
  let node = row;
  while (node !== null) {
    if (node.getAttribute?.("hidden") === "until-found")
      node.removeAttribute("hidden");
    node = node.parentElement;
  }
}
function scrollportOf(row) {
  const declared = row.closest?.(SCROLLPORT_SELECTOR);
  if (isElement(declared))
    return declared;
  let node = row.parentElement;
  while (node !== null) {
    const overflow = typeof getComputedStyle === "function" ? getComputedStyle(node).overflowY : "";
    if (overflow === "auto" || overflow === "scroll" || node.scrollHeight > node.clientHeight)
      return node;
    node = node.parentElement;
  }
  return isElement(row.ownerDocument?.documentElement ?? null) ? row.ownerDocument.documentElement : void 0;
}
function landOnRow(row, flashMs = DEFAULT_FLASH_MS) {
  const scroller = scrollportOf(row);
  if (scroller !== void 0) {
    const delta = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - LANDING_INSET;
    const top = Math.max(0, scroller.scrollTop + delta);
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    } else {
      scroller.scrollTop = top;
    }
  } else if (typeof row.scrollIntoView === "function") {
    row.scrollIntoView({ block: "center" });
  }
  if (flashMs > 0)
    flashRow(row, flashMs);
}
function flashRow(row, durationMs = DEFAULT_FLASH_MS) {
  const previousOutline = row.style.outline;
  const previousOffset = row.style.outlineOffset;
  row.style.outline = FLASH_OUTLINE;
  row.style.outlineOffset = "2px";
  const clear = () => {
    row.style.outline = previousOutline;
    row.style.outlineOffset = previousOffset;
  };
  if (typeof setTimeout === "function")
    setTimeout(clear, durationMs);
  else
    clear();
}
function nextFrame() {
  if (typeof requestAnimationFrame === "function") {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  }
  return Promise.resolve();
}
async function waitForRow(root, keys, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (; ; ) {
    const found = findAnchorRow(root, keys);
    if (found !== void 0)
      return found;
    if (Date.now() >= deadline)
      return void 0;
    await nextFrame();
    await new Promise((resolve) => {
      setTimeout(resolve, 16);
    });
  }
}
async function jumpToAnchor(deps) {
  if (deps.anchorKeys.length === 0)
    return { landed: false, reason: "no-anchor" };
  const root = deps.root ?? ambientRoot();
  if (root === void 0)
    return { landed: false, reason: "no-document" };
  const immediate = findAnchorRow(root, deps.anchorKeys);
  if (immediate !== void 0) {
    revealAncestors(immediate.row);
    landOnRow(immediate.row, deps.flashMs);
    return { landed: true, key: immediate.key };
  }
  if (deps.loadThrough !== void 0) {
    await deps.loadThrough(deps.seq);
    const found = await waitForRow(root, deps.anchorKeys, 400);
    if (found !== void 0) {
      revealAncestors(found.row);
      landOnRow(found.row, deps.flashMs);
      return { landed: true, key: found.key };
    }
  }
  if (deps.loadOlder !== void 0) {
    const maxPages = deps.maxPages ?? DEFAULT_MAX_PAGES;
    for (let page = 0; page < maxPages; page += 1) {
      await deps.loadOlder();
      const found = await waitForRow(root, deps.anchorKeys, 400);
      if (found !== void 0) {
        revealAncestors(found.row);
        landOnRow(found.row, deps.flashMs);
        return { landed: true, key: found.key };
      }
    }
  }
  return { landed: false, reason: "not-loaded" };
}

// ../../packages/session/delta-search/lib/transcript.js
var UNAVAILABLE = { entries: [], hasMore: false, available: false };
var BINDING_POLL_MS = 250;
function createTranscriptSource(sessions, sessionId) {
  let cachedWindow;
  let cached = UNAVAILABLE;
  const readBinding = () => sessions?.binding?.(sessionId);
  const snapshot = () => {
    const source = readBinding()?.eventSource;
    if (source === void 0) {
      if (cachedWindow === void 0)
        return cached;
      cachedWindow = void 0;
      cached = UNAVAILABLE;
      return cached;
    }
    const window = source.getSnapshot();
    if (window === cachedWindow)
      return cached;
    cachedWindow = window;
    const entries = [];
    for (const entry of window.entries) {
      if (entry.type !== "event")
        continue;
      entries.push({
        type: entry.event.type,
        seq: entry.event.seq,
        ...entry.event.time === void 0 ? {} : { time: entry.event.time },
        ...entry.event.data === void 0 ? {} : { data: entry.event.data }
      });
    }
    cached = { entries, hasMore: window.hasMore, available: true };
    return cached;
  };
  return {
    getSnapshot: snapshot,
    subscribe(listener) {
      let attached;
      let unsubscribe;
      let poll;
      const attach = () => {
        const source = readBinding()?.eventSource;
        if (source === attached)
          return;
        unsubscribe?.();
        attached = source;
        unsubscribe = source?.subscribe(listener);
        if (source !== void 0 && poll !== void 0) {
          clearInterval(poll);
          poll = void 0;
        }
        if (source === void 0 && poll === void 0) {
          poll = setInterval(() => {
            attach();
            listener();
          }, BINDING_POLL_MS);
        }
      };
      attach();
      return () => {
        unsubscribe?.();
        if (poll !== void 0)
          clearInterval(poll);
      };
    }
  };
}

// ../../packages/session/delta-search/lib/panel.js
var CLOSED = { open: false };
var OPEN = { open: true };
function createEntry() {
  const entry = {
    value: CLOSED,
    listeners: /* @__PURE__ */ new Set(),
    source: {
      getSnapshot: () => entry.value,
      subscribe(listener) {
        entry.listeners.add(listener);
        return () => {
          entry.listeners.delete(listener);
        };
      }
    }
  };
  return entry;
}
function createOpenRegistry() {
  const entries = /* @__PURE__ */ new Map();
  const entryFor = (sessionId) => {
    const existing = entries.get(sessionId);
    if (existing !== void 0)
      return existing;
    const created = createEntry();
    entries.set(sessionId, created);
    return created;
  };
  const set = (sessionId, open) => {
    const entry = entryFor(sessionId);
    const next = open ? OPEN : CLOSED;
    if (entry.value === next)
      return;
    entry.value = next;
    for (const listener of [...entry.listeners])
      listener();
  };
  return {
    sourceFor: (sessionId) => entryFor(sessionId).source,
    toggle: (sessionId) => {
      set(sessionId, !entryFor(sessionId).value.open);
    },
    close: (sessionId) => {
      set(sessionId, false);
    }
  };
}

// src/client/locales.ts
var NS = "sessionList";
var zh = {
  "button.title": "\u672C\u5BF9\u8BDD\u7684\u63D0\u95EE\u5217\u8868",
  "panel.label": "\u63D0\u95EE\u5217\u8868",
  "panel.placeholder": "\u7B5B\u9009\u63D0\u95EE\u2026",
  "panel.turns": "\u4E2A\u63D0\u95EE",
  "panel.empty": "\u672C\u5BF9\u8BDD\u8FD8\u6CA1\u6709\u63D0\u95EE",
  "panel.emptyFilter": "\u6CA1\u6709\u5339\u914D\u7684\u63D0\u95EE",
  "panel.more": "\uFF08\u8FD8\u6709\u66F4\u65E9\u7684\u5386\u53F2\u672A\u52A0\u8F7D\uFF09",
  "panel.complete": "\uFF08\u5DF2\u8986\u76D6\u5168\u90E8\u5386\u53F2\uFF09",
  "panel.close": "\u5173\u95ED",
  "panel.turn": "\u7B2C",
  "panel.turnSuffix": "\u8F6E",
  "panel.answer": "\u56DE\u7B54",
  "panel.pending": "\uFF08\u672A\u56DE\u7B54\uFF09",
  "panel.jumpFailed": "\u8BE5\u63D0\u95EE\u5728\u5DF2\u52A0\u8F7D\u8303\u56F4\u4E4B\u5916\uFF0C\u65E0\u6CD5\u8DF3\u8F6C"
};
var en = {
  "button.title": "Prompts in this conversation",
  "panel.label": "Prompt outline",
  "panel.placeholder": "Filter prompts\u2026",
  "panel.turns": "prompts",
  "panel.empty": "No prompt yet in this conversation",
  "panel.emptyFilter": "No prompt matches",
  "panel.more": "(older history not loaded)",
  "panel.complete": "(whole history covered)",
  "panel.close": "Close",
  "panel.turn": "Turn",
  "panel.turnSuffix": "",
  "panel.answer": "Answer",
  "panel.pending": "(unanswered)",
  "panel.jumpFailed": "That turn is outside the loaded range"
};

// src/client/styles.ts
var STYLE_ID = "dsh-session-list";
var CSS = `
.dsh-slt-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: .75;
}
.dsh-slt-button:hover, .dsh-slt-button[aria-pressed="true"] { opacity: 1; background: color-mix(in srgb, CanvasText 10%, transparent); }
.dsh-slt-panel {
  position: absolute;
  inset-inline: 0;
  bottom: calc(100% + 8px);
  z-index: 39;
  display: flex;
  flex-direction: column;
  max-height: min(60vh, 520px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
  border-radius: 10px;
  background: Canvas;
  color: CanvasText;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .22);
  font-size: 13px;
  line-height: 1.45;
}
.dsh-slt-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
.dsh-slt-input { flex: 1 1 auto; min-width: 0; padding: 6px 8px; border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: 6px; background: Field; color: FieldText; font: inherit; }
.dsh-slt-input:focus-visible { outline: 2px solid Highlight; outline-offset: 1px; }
.dsh-slt-count { flex: 0 0 auto; opacity: .7; font-variant-numeric: tabular-nums; }
.dsh-slt-list { flex: 1 1 auto; overflow: auto; margin: 0; padding: 4px; list-style: none; }
.dsh-slt-item { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; padding: 7px 8px; border-radius: 6px; cursor: pointer; }
.dsh-slt-item:hover { background: color-mix(in srgb, CanvasText 7%, transparent); }
.dsh-slt-item[aria-selected="true"] { background: color-mix(in srgb, Highlight 26%, transparent); }
.dsh-slt-badge { grid-row: 1 / span 2; align-self: start; padding: 0 6px; border-radius: 999px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); font-size: 11px; opacity: .8; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dsh-slt-prompt { min-width: 0; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.dsh-slt-empty { color: color-mix(in srgb, CanvasText 55%, transparent); font-style: italic; }
.dsh-slt-meta { font-size: 11px; opacity: .6; overflow-wrap: anywhere; }
.dsh-slt-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent); font-size: 11px; opacity: .8; }
.dsh-slt-action { padding: 3px 8px; border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
`;

// src/client/TurnButton.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function TurnButton({ useOpen, toggle, t }) {
  const open = useOpen((state) => state.open);
  const label = t("button.title");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className: "dsh-slt-button",
      "aria-pressed": open,
      "aria-label": label,
      title: label,
      onClick: toggle,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: "0 0 16 16", width: "15", height: "15", "aria-hidden": "true", focusable: "false", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "2", y1: "4", x2: "14", y2: "4", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "2", y1: "8", x2: "10", y2: "8", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "2", y1: "12", x2: "12", y2: "12", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" })
      ] })
    }
  );
}

// src/client/TurnPanel.tsx
var import_react = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function matches(item, needle) {
  if (needle === "") return true;
  return item.prompt.toLowerCase().includes(needle) || item.response.toLowerCase().includes(needle);
}
function TurnPanel(props) {
  const { useOpen, useTranscript, close, jump, t } = props;
  const open = useOpen((state) => state.open);
  const transcript = useTranscript((state) => state);
  const [filter, setFilter] = (0, import_react.useState)("");
  const [active, setActive] = (0, import_react.useState)(0);
  const inputRef = (0, import_react.useRef)(null);
  const listRef = (0, import_react.useRef)(null);
  const turns = (0, import_react.useMemo)(() => buildTurnItems(transcript.entries), [transcript.entries]);
  const needle = filter.trim().toLowerCase();
  const visible = (0, import_react.useMemo)(() => turns.filter((item) => matches(item, needle)), [turns, needle]);
  (0, import_react.useEffect)(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  (0, import_react.useEffect)(() => {
    setActive(0);
  }, [needle, turns.length]);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const list = listRef.current;
    if (list === null) return;
    const rows = list.querySelectorAll("[data-turn-index]");
    const last = rows[rows.length - 1];
    if (last instanceof HTMLElement && typeof last.scrollIntoView === "function") {
      last.scrollIntoView({ block: "nearest" });
    }
  }, [open, visible.length]);
  (0, import_react.useEffect)(() => {
    const list = listRef.current;
    if (list === null) return;
    const row = list.querySelector(`[data-turn-index="${String(active)}"]`);
    if (row instanceof HTMLElement && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [active, visible]);
  if (!open) return null;
  const pick = (index) => {
    const item = visible[index];
    if (item === void 0) return;
    setActive(index);
    jump(item);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "dsh-slt-panel", role: "dialog", "aria-label": t("panel.label"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-slt-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          ref: inputRef,
          className: "dsh-slt-input",
          type: "search",
          value: filter,
          placeholder: t("panel.placeholder"),
          "aria-label": t("panel.label"),
          onChange: (event) => {
            setFilter(event.target.value);
          },
          onKeyDown: (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => Math.min(current + 1, Math.max(0, visible.length - 1)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(current - 1, 0));
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              pick(active);
            }
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-slt-count", children: `${String(visible.length)} ${t("panel.turns")}` }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dsh-slt-action", onClick: close, title: t("panel.close"), children: t("panel.close") })
    ] }),
    visible.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-slt-list", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-slt-empty", children: turns.length === 0 ? t("panel.empty") : t("panel.emptyFilter") }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "dsh-slt-list", ref: listRef, children: visible.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "li",
      {
        className: "dsh-slt-item",
        "data-turn-index": index,
        "aria-selected": index === active,
        onClick: () => {
          pick(index);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-slt-badge", children: `#${String(item.turn)}` }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-slt-prompt", children: item.prompt === "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-slt-empty", children: t("panel.pending") }) : preview(item.prompt, 400) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-slt-meta", children: item.response === "" ? t("panel.pending") : `${t("panel.answer")}: ${preview(item.response, 160)}` })
        ]
      },
      `${String(item.turn)}-${String(item.seq)}`
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-slt-foot", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
      `${String(turns.length)} ${t("panel.turns")} `,
      transcript.hasMore ? t("panel.more") : t("panel.complete")
    ] }) })
  ] });
}

// src/client/index.ts
var inject = ["slots", "locale", "sessions"];
var SEAT_ID = "session-list";
function installStyles() {
  if (typeof document === "undefined") return () => {
  };
  if (document.getElementById(STYLE_ID) !== null) return () => {
  };
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
  return () => {
    tag.remove();
  };
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "session-list: dictionaries");
  ctx.effect(() => installStyles(), "session-list: styles");
  console.info("[session-list] active");
  const registry = createOpenRegistry();
  const conversationOf = (sessionId) => ctx.sessions?.scope?.(sessionId)?.get("conversation");
  ctx.effect(() => ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
    name: "conversation.session.header.utilities",
    id: SEAT_ID,
    order: 21,
    locale: NS,
    inject: (sessionId) => ({
      hooks: { open: registry.sourceFor(sessionId) },
      toggle: () => {
        registry.toggle(sessionId);
      }
    })
  }, TurnButton)), "session-list: header button");
  ctx.effect(() => ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
    name: "conversation.input.overlay",
    id: SEAT_ID,
    order: 21,
    locale: NS,
    inject: (sessionId) => {
      const transcript = createTranscriptSource(ctx.sessions, sessionId);
      return {
        hooks: { open: registry.sourceFor(sessionId), transcript },
        close: () => {
          registry.close(sessionId);
        },
        jump: (item) => {
          void jumpToAnchor({
            anchorKeys: item.anchorKeys,
            seq: item.seq,
            loadOlder: () => conversationOf(sessionId)?.loadOlder() ?? Promise.resolve()
          });
        }
      };
    }
  }, TurnPanel)), "session-list: outline panel");
}
return module.exports; } });
