window.__ModuleLoader__.load({ id: "@2elian/dsh-client-ui-session-delta-search", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
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

// ../../packages/session/delta-search/lib/extract.js
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value) {
  return typeof value === "string" && value.trim() !== "" ? value : void 0;
}
function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function blockSpans(blocks, textKind) {
  if (!Array.isArray(blocks))
    return [];
  const spans = [];
  for (const raw of blocks) {
    if (!isRecord(raw))
      continue;
    const direct = text(raw.text);
    if (raw.type === "reasoning") {
      if (direct !== void 0)
        spans.push({ kind: "reasoning", text: direct });
      continue;
    }
    if (raw.type === "tool-call" || raw.type === "tool-result") {
      const head = [text(raw.name), text(raw.arguments) ?? text(raw.input)].filter((part) => part !== void 0).join(" ");
      if (head !== "")
        spans.push({ kind: "tool-call", text: head });
      spans.push(...blockSpans(raw.content, "tool-result"));
      continue;
    }
    if (direct !== void 0) {
      spans.push({ kind: textKind, text: direct });
      continue;
    }
    spans.push(...blockSpans(raw.content, textKind));
  }
  return spans;
}
function streamSpans(stream) {
  if (!Array.isArray(stream))
    return [];
  const spans = [];
  for (const raw of stream) {
    if (!isRecord(raw))
      continue;
    const kind = raw.type === "reasoning-chunks" ? "reasoning" : "assistant";
    if (!Array.isArray(raw.texts))
      continue;
    for (const chunk of raw.texts) {
      const chunkText = text(chunk);
      if (chunkText !== void 0)
        spans.push({ kind, text: chunkText });
    }
  }
  return spans;
}
function toolResultSpans(data) {
  const spans = blockSpans(isRecord(data.message) ? data.message.content : void 0, "tool-result");
  const error = isRecord(data.error) ? data.error : void 0;
  if (error !== void 0) {
    const reason = [text(error.name), text(error.code), text(error.reason)].filter((part) => part !== void 0).join(" ");
    if (reason !== "")
      spans.push({ kind: "tool-result", text: reason });
  }
  return spans;
}
function documentFromEvent(event) {
  const data = isRecord(event.data) ? event.data : {};
  const turn = number(data.turn) ?? null;
  const step = number(data.step) ?? null;
  let spans;
  switch (event.type) {
    case "user/message": {
      const source = isRecord(data.source) ? data.source : void 0;
      spans = blockSpans(data.content, source?.kind === "user" ? "user" : "context");
      break;
    }
    case "assistant/message":
      spans = blockSpans(isRecord(data.message) ? data.message.content : void 0, "assistant");
      break;
    case "assistant/attempt":
      spans = streamSpans(data.stream);
      break;
    case "system/message":
      spans = blockSpans(isRecord(data.message) ? data.message.content : void 0, "context");
      break;
    case "tool/call": {
      const head = [text(data.name), text(data.arguments)].filter((part) => part !== void 0).join(" ");
      spans = head === "" ? [] : [{ kind: "tool-call", text: head }];
      break;
    }
    case "tool/result":
      spans = toolResultSpans(data);
      break;
    case "todo/write": {
      const head = [text(data.status), text(data.content)].filter((part) => part !== void 0).join(" ");
      spans = head === "" ? [] : [{ kind: "note", text: head }];
      break;
    }
    default:
      return void 0;
  }
  if (spans.length === 0)
    return void 0;
  const segments = spans.map((span) => ({ kind: span.kind, text: span.text }));
  return { seq: event.seq, eventType: event.type, time: event.time ?? 0, turn, step, segments };
}
function buildDocuments(events) {
  const documents = [];
  for (const event of events) {
    const document2 = documentFromEvent(event);
    if (document2 !== void 0)
      documents.push(document2);
  }
  return documents;
}

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

// ../../packages/session/delta-search/lib/search.js
var DEFAULT_LIMIT = 200;
var DEFAULT_CONTEXT = 60;
function tokenize(query) {
  return query.trim().split(/\s+/u).filter((term) => term !== "");
}
function occurrenceIndexes(haystack, needle, wholeWord) {
  const indexes = [];
  if (needle === "")
    return indexes;
  let from = 0;
  for (; ; ) {
    const at = haystack.indexOf(needle, from);
    if (at < 0)
      break;
    if (!wholeWord || isWordBounded(haystack, at, needle.length))
      indexes.push(at);
    from = at + 1;
  }
  return indexes;
}
function isWordBounded(haystack, at, length) {
  const before = at === 0 ? "" : haystack[at - 1] ?? "";
  const after = haystack[at + length] ?? "";
  return !isWordCharacter(before) && !isWordCharacter(after);
}
function isWordCharacter(value) {
  return value !== "" && /[\p{L}\p{N}_]/u.test(value);
}
function searchDocuments(documents, query, options = {}) {
  const terms = tokenize(query);
  if (terms.length === 0)
    return [];
  const caseSensitive = options.caseSensitive ?? false;
  const wholeWord = options.wholeWord ?? false;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const context = options.context ?? DEFAULT_CONTEXT;
  const kinds = options.kinds === void 0 ? void 0 : new Set(options.kinds);
  const lowered = terms.map((term) => caseSensitive ? term : term.toLowerCase());
  const hits = [];
  for (const document2 of documents) {
    for (const segment of document2.segments) {
      if (kinds !== void 0 && !kinds.has(segment.kind))
        continue;
      const haystack = caseSensitive ? segment.text : segment.text.toLowerCase();
      const positions = [];
      let complete = true;
      for (const term of lowered) {
        const found = occurrenceIndexes(haystack, term, wholeWord);
        if (found.length === 0) {
          complete = false;
          break;
        }
        positions.push(found);
      }
      if (!complete)
        continue;
      const firstTerm = lowered[0] ?? "";
      const anchors = positions[0] ?? [];
      for (const [ordinal, anchor] of anchors.entries()) {
        const start = Math.max(0, anchor - context);
        const end = Math.min(segment.text.length, anchor + firstTerm.length + context);
        hits.push({
          seq: document2.seq,
          eventType: document2.eventType,
          time: document2.time,
          turn: document2.turn,
          step: document2.step,
          kind: segment.kind,
          before: segment.text.slice(start, anchor),
          match: segment.text.slice(anchor, anchor + firstTerm.length),
          after: segment.text.slice(anchor + firstTerm.length, end),
          ordinal: ordinal + 1
        });
        if (hits.length >= limit)
          return hits;
      }
    }
  }
  return hits;
}
function countByKind(hits) {
  const counts = {};
  for (const hit of hits)
    counts[hit.kind] = (counts[hit.kind] ?? 0) + 1;
  return counts;
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
var NS = "sessionDeltaSearch";
var zh = {
  "button.title": "\u5728\u672C\u5BF9\u8BDD\u4E2D\u641C\u7D22",
  "panel.label": "\u5BF9\u8BDD\u641C\u7D22",
  "panel.placeholder": "\u641C\u7D22\u672C\u5BF9\u8BDD\uFF1A\u63D0\u793A\u8BCD\u3001\u56DE\u7B54\u3001\u63A8\u7406\u3001\u5DE5\u5177\u8C03\u7528\u4E0E\u7ED3\u679C",
  "panel.results": "\u6761\u7ED3\u679C",
  "panel.empty": "\u6CA1\u6709\u5339\u914D\u7684\u5185\u5BB9",
  "panel.emptyHint": "\u5DF2\u641C\u7D22\u5F53\u524D\u52A0\u8F7D\u7684\u5BF9\u8BDD\u5185\u5BB9\u3002\u66F4\u65E9\u7684\u5386\u53F2\u9700\u8981\u5148\u52A0\u8F7D\u3002",
  "panel.loading": "\u641C\u7D22\u4E2D\u2026",
  "panel.scope": "\u5DF2\u7D22\u5F15",
  "panel.events": "\u6761\u4E8B\u4EF6",
  "panel.more": "\uFF08\u8FD8\u6709\u66F4\u65E9\u7684\u5386\u53F2\u672A\u52A0\u8F7D\uFF09",
  "panel.complete": "\uFF08\u5DF2\u8986\u76D6\u5168\u90E8\u5386\u53F2\uFF09",
  "panel.loadAll": "\u52A0\u8F7D\u5168\u90E8\u5386\u53F2",
  "panel.close": "\u5173\u95ED",
  "panel.prev": "\u4E0A\u4E00\u4E2A",
  "panel.next": "\u4E0B\u4E00\u4E2A",
  "panel.caseSensitive": "\u533A\u5206\u5927\u5C0F\u5199",
  "panel.wholeWord": "\u5168\u8BCD\u5339\u914D",
  "panel.filter": "\u8303\u56F4",
  "panel.jump.newer": "\u8BE5\u7ED3\u679C\u5728\u5DF2\u52A0\u8F7D\u8303\u56F4\u4E4B\u5916\uFF0C\u65E0\u6CD5\u8DF3\u8F6C",
  "kind.user": "\u63D0\u95EE",
  "kind.assistant": "\u56DE\u7B54",
  "kind.reasoning": "\u63A8\u7406",
  "kind.tool-call": "\u5DE5\u5177\u8C03\u7528",
  "kind.tool-result": "\u5DE5\u5177\u7ED3\u679C",
  "kind.context": "\u6CE8\u5165",
  "kind.note": "\u8BB0\u5F55"
};
var en = {
  "button.title": "Search this conversation",
  "panel.label": "Conversation search",
  "panel.placeholder": "Search prompts, answers, reasoning, tool calls and results",
  "panel.results": "results",
  "panel.empty": "No match",
  "panel.emptyHint": "Searched the loaded part of this conversation. Older history must be loaded first.",
  "panel.loading": "Searching\u2026",
  "panel.scope": "Indexed",
  "panel.events": "events",
  "panel.more": "(older history not loaded)",
  "panel.complete": "(whole history covered)",
  "panel.loadAll": "Load all history",
  "panel.close": "Close",
  "panel.prev": "Previous",
  "panel.next": "Next",
  "panel.caseSensitive": "Match case",
  "panel.wholeWord": "Whole word",
  "panel.filter": "Scope",
  "panel.jump.newer": "That result is outside the loaded range",
  "kind.user": "prompt",
  "kind.assistant": "answer",
  "kind.reasoning": "reasoning",
  "kind.tool-call": "tool call",
  "kind.tool-result": "tool result",
  "kind.context": "injected",
  "kind.note": "note"
};

// src/client/styles.ts
var STYLE_ID = "dsh-session-delta-search";
var CSS = `
.dsh-sds-button {
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
.dsh-sds-button:hover, .dsh-sds-button[aria-pressed="true"] { opacity: 1; background: color-mix(in srgb, CanvasText 10%, transparent); }
.dsh-sds-panel {
  position: absolute;
  inset-inline: 0;
  bottom: calc(100% + 8px);
  z-index: 40;
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
.dsh-sds-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
.dsh-sds-input { flex: 1 1 auto; min-width: 0; padding: 6px 8px; border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: 6px; background: Field; color: FieldText; font: inherit; }
.dsh-sds-input:focus-visible { outline: 2px solid Highlight; outline-offset: 1px; }
.dsh-sds-count { flex: 0 0 auto; opacity: .7; font-variant-numeric: tabular-nums; }
.dsh-sds-opts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
.dsh-sds-opt { display: inline-flex; align-items: center; gap: 4px; opacity: .85; cursor: pointer; }
.dsh-sds-opt input { margin: 0; }
.dsh-sds-list { flex: 1 1 auto; overflow: auto; margin: 0; padding: 4px; list-style: none; }
.dsh-sds-hit { display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.dsh-sds-hit:hover { background: color-mix(in srgb, CanvasText 7%, transparent); }
.dsh-sds-hit[aria-selected="true"] { background: color-mix(in srgb, Highlight 26%, transparent); }
.dsh-sds-badge { grid-row: 1 / span 2; align-self: start; padding: 0 6px; border-radius: 999px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); font-size: 11px; opacity: .8; white-space: nowrap; }
.dsh-sds-text { min-width: 0; overflow-wrap: anywhere; }
.dsh-sds-meta { font-size: 11px; opacity: .6; }
.dsh-sds-text mark { background: color-mix(in srgb, Highlight 55%, transparent); color: inherit; border-radius: 2px; }
.dsh-sds-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent); font-size: 11px; opacity: .8; }
.dsh-sds-action { padding: 3px 8px; border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.dsh-sds-action:disabled { opacity: .5; cursor: default; }
.dsh-sds-empty { padding: 16px 12px; text-align: center; opacity: .7; }
`;

// src/client/SearchButton.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function SearchButton({ useOpen, toggle: toggle2, t }) {
  const open = useOpen((state) => state.open);
  const label = t("button.title");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className: "dsh-sds-button",
      "aria-pressed": open,
      "aria-label": label,
      title: label,
      onClick: toggle2,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: "0 0 16 16", width: "15", height: "15", "aria-hidden": "true", focusable: "false", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "7", cy: "7", r: "4.25", fill: "none", stroke: "currentColor", strokeWidth: "1.5" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "10.4", y1: "10.4", x2: "14", y2: "14", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" })
      ] })
    }
  );
}

// src/client/SearchPanel.tsx
var import_react = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var KIND_FILTERS = [
  "user",
  "assistant",
  "reasoning",
  "tool-call",
  "tool-result",
  "context"
];
function toggle(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
function HitRow({ hit, selected, index, t, onPick }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "li",
    {
      className: "dsh-sds-hit",
      "aria-selected": selected,
      "data-hit-index": index,
      onClick: onPick,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-sds-badge", children: t(`kind.${hit.kind}`) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dsh-sds-text", children: [
          hit.before,
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("mark", { children: hit.match }),
          hit.after
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dsh-sds-meta", children: [
          hit.turn === null ? "" : `#${String(hit.turn)}`,
          hit.turn === null ? "" : " \u8DEF ",
          `seq ${String(hit.seq)}`
        ] })
      ]
    }
  );
}
function SearchPanel(props) {
  const { useOpen, useTranscript, close, loadAll, jump, t } = props;
  const open = useOpen((state) => state.open);
  const transcript = useTranscript((state) => state);
  const [query, setQuery] = (0, import_react.useState)("");
  const [caseSensitive, setCaseSensitive] = (0, import_react.useState)(false);
  const [wholeWord, setWholeWord] = (0, import_react.useState)(false);
  const [kinds, setKinds] = (0, import_react.useState)([]);
  const [active, setActive] = (0, import_react.useState)(0);
  const [loadingAll, setLoadingAll] = (0, import_react.useState)(false);
  const inputRef = (0, import_react.useRef)(null);
  const listRef = (0, import_react.useRef)(null);
  const documents = (0, import_react.useMemo)(() => buildDocuments(transcript.entries), [transcript.entries]);
  const hits = (0, import_react.useMemo)(
    () => searchDocuments(documents, query, {
      caseSensitive,
      wholeWord,
      ...kinds.length === 0 ? {} : { kinds }
    }),
    [documents, query, caseSensitive, wholeWord, kinds]
  );
  const counts = (0, import_react.useMemo)(() => countByKind(hits), [hits]);
  (0, import_react.useEffect)(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  (0, import_react.useEffect)(() => {
    setActive(0);
  }, [query, caseSensitive, wholeWord, kinds]);
  (0, import_react.useEffect)(() => {
    const list = listRef.current;
    if (list === null) return;
    const row = list.querySelector(`[data-hit-index="${String(active)}"]`);
    if (row instanceof HTMLElement && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [active, hits]);
  if (!open) return null;
  const pick = (index) => {
    const hit = hits[index];
    if (hit === void 0) return;
    setActive(index);
    jump(hit.seq);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "dsh-sds-panel", role: "dialog", "aria-label": t("panel.label"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-sds-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          ref: inputRef,
          className: "dsh-sds-input",
          type: "search",
          value: query,
          placeholder: t("panel.placeholder"),
          "aria-label": t("panel.label"),
          onChange: (event) => {
            setQuery(event.target.value);
          },
          onKeyDown: (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => Math.min(current + 1, Math.max(0, hits.length - 1)));
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
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-sds-count", children: `${String(hits.length)} ${t("panel.results")}` }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dsh-sds-action", onClick: close, title: t("panel.close"), children: t("panel.close") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-sds-opts", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "dsh-sds-opt", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: caseSensitive, onChange: (event) => {
          setCaseSensitive(event.target.checked);
        } }),
        t("panel.caseSensitive")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "dsh-sds-opt", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: wholeWord, onChange: (event) => {
          setWholeWord(event.target.checked);
        } }),
        t("panel.wholeWord")
      ] }),
      KIND_FILTERS.map((kind) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "dsh-sds-opt", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            type: "checkbox",
            checked: kinds.includes(kind),
            onChange: () => {
              setKinds((current) => toggle(current, kind));
            }
          }
        ),
        `${t(`kind.${kind}`)}${counts[kind] === void 0 ? "" : ` ${String(counts[kind])}`}`
      ] }, kind))
    ] }),
    hits.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-sds-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: query.trim() === "" ? t("panel.placeholder") : t("panel.empty") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: t("panel.emptyHint") })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "dsh-sds-list", ref: listRef, children: hits.map((hit, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      HitRow,
      {
        hit,
        index,
        selected: index === active,
        t,
        onPick: () => {
          pick(index);
        }
      },
      `${String(hit.seq)}-${String(hit.ordinal)}-${String(index)}`
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-sds-foot", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        `${t("panel.scope")} ${String(documents.length)} ${t("panel.events")} `,
        transcript.hasMore ? t("panel.more") : t("panel.complete")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-sds-action",
          disabled: !transcript.hasMore || loadingAll,
          onClick: () => {
            setLoadingAll(true);
            void loadAll().finally(() => {
              setLoadingAll(false);
            });
          },
          children: loadingAll ? t("panel.loading") : t("panel.loadAll")
        }
      )
    ] })
  ] });
}

// src/client/index.ts
var inject = ["slots", "locale", "sessions"];
var MAX_PAGES = 40;
var SEAT_ID = "session-delta-search";
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
function nextFrame2() {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "session-delta-search: dictionaries");
  ctx.effect(() => installStyles(), "session-delta-search: styles");
  console.info("[session-delta-search] active");
  const registry = createOpenRegistry();
  const conversationOf = (sessionId) => ctx.sessions?.scope?.(sessionId)?.get("conversation");
  ctx.effect(() => ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
    name: "conversation.session.header.utilities",
    id: SEAT_ID,
    order: 20,
    locale: NS,
    inject: (sessionId) => ({
      hooks: { open: registry.sourceFor(sessionId) },
      toggle: () => {
        registry.toggle(sessionId);
      }
    })
  }, SearchButton)), "session-delta-search: header button");
  ctx.effect(() => ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
    name: "conversation.input.overlay",
    id: SEAT_ID,
    order: 20,
    locale: NS,
    inject: (sessionId) => {
      const transcript = createTranscriptSource(ctx.sessions, sessionId);
      const loadOlder = () => conversationOf(sessionId)?.loadOlder() ?? Promise.resolve();
      return {
        hooks: { open: registry.sourceFor(sessionId), transcript },
        close: () => {
          registry.close(sessionId);
        },
        // Paging is the only way to reach history the window has not loaded;
        // each pull re-renders the panel, so the index grows as it goes.
        loadAll: async () => {
          for (let page = 0; page < MAX_PAGES; page += 1) {
            if (!transcript.getSnapshot().hasMore) return;
            if (conversationOf(sessionId) === void 0) return;
            await loadOlder();
            await nextFrame2();
          }
        },
        jump: (seq) => {
          const event = transcript.getSnapshot().entries.find((entry) => entry.seq === seq);
          void jumpToAnchor({
            anchorKeys: event === void 0 ? [] : anchorKeysForEvent(event),
            seq,
            loadOlder
          });
        }
      };
    }
  }, SearchPanel)), "session-delta-search: search panel");
}
return module.exports; } });
