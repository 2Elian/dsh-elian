# @2elian/dsh-session-delta-search

在 DeepSeek Harness 会话的事件窗口上做关键字搜索的框架无关核心库。

## 它补的是哪一段

Harness 已有的两条搜索路径都不满足「搜到 → 跳过去」：

| 现有能力 | 缺口 |
| --- | --- |
| `ctx.sessionQuery.searchEvents` | 抽取器对 `reasoning` 块返回 `''`，推理搜不到 |
| Web 端 `session.search` | 只返回 `{ sessionId, snippet }`，没有 seq / 没有位置 |
| `ui-chat` 的 `navigateToTurn` | 组件内部 `useCallback`，不导出，且只到 turn 粒度 |

本库补的正是这一段。原因详见 [架构说明](../../../docs/architecture/browser-side-search.md)。

## 公开 API

### 抽取

```ts
import { buildDocuments, documentFromEvent } from '@2elian/dsh-session-delta-search'

const documents = buildDocuments(window.entries.map(entry => entry.event))
```

覆盖 `user/message`、`assistant/message`（含 `reasoning` 块）、`assistant/attempt` 的 stream、`system/message`、`tool/call`、`tool/result`（含失败信息）、`todo/write`。结构化事件（turn/step 边界、header、重试）不产生文档。

用户消息按 `source.kind` 分类：`user` → `'user'`，其余（注入的技能正文、工作区规则、cron 通知）→ `'context'`，所以「提问」不会被注入内容污染。

### 查询

```ts
import { searchDocuments, countByKind } from '@2elian/dsh-session-delta-search'

const hits = searchDocuments(documents, 'parser lexer', {
  caseSensitive: false,
  wholeWord: false,
  kinds: ['assistant', 'reasoning'],
  limit: 200,
  context: 60,
})
```

按空白切词，**所有词必须出现在同一段文本里**；默认大小写不敏感的子串匹配，绝不当正则处理。每个「首词出现处」产出一条命中，带 `before` / `match` / `after` 三段用于高亮。

### 锚点

```ts
import { anchorKeysForEvent } from '@2elian/dsh-session-delta-search'

anchorKeysForEvent({ type: 'user/message', seq: 3, data: { id: 'm1' } })
// → ['13:input-messagem1']
```

复刻的是 `ui-conversation` 的 `conversationContextKey(kind, id)`：`` `${kind.length}:${kind}${id}` ``。每个事件返回**多个候选**，因为同一事件可能只有较粗的那一行已加载；工具调用还额外给出 `ui-tool` 独立文档化的 `call:<callId>` 形式。

### 提问大纲

```ts
import { buildTurnItems, preview } from '@2elian/dsh-session-delta-search'

const turns = buildTurnItems(events)
// [{ turn, seq, time, prompt, response, anchorKeys }]
```

prompt 取该 turn 内**第一条人类** `user/message`（与宿主 `turnOutline` 同一规则，注入内容不算提问），response 取最后一条 assistant 文本（对齐轨道 rail 的 `findLast` 语义）。`seq` 是 `turn/start` 的序号，也是回溯翻页的游标；`anchorKeys` 是把正文滚到该 turn 用的行锚点。

### 落点

```ts
import { jumpToAnchor } from '@2elian/dsh-session-delta-search'

await jumpToAnchor({
  anchorKeys: ['13:input-messagem1'],
  seq: 3,
  loadOlder: () => ctx.conversation.loadOlder(),
})
```

按顺序：DOM 里已有该行 → 直接落；否则翻历史页再等行出现（带超时）；行被紧凑模式的 `hidden="until-found"` 折起来时先展开，再按 `[data-conversation-scroll]` 滚动容器做 `scrollTop` 定位，最后描边高亮。无 `document` 时返回 `{ landed: false }` 而不是抛错。

### 浏览器适配

```ts
import { createTranscriptSource, createOpenRegistry } from '@2elian/dsh-session-delta-search'

const transcript = createTranscriptSource(ctx.sessions, sessionId)  // { getSnapshot, subscribe }
const panels = createOpenRegistry()                                  // 按 session 的开关状态
```

这两个是给插件的 slot `hooks` 用的：返回对象身份在变化之间保持稳定，符合渲染层 `useSyncExternalStore` 的要求。`surface.ts` 里同时声明了它们依赖的宿主接口，每条都注明了 DSH 源码位置。

## 设计约束

- **零依赖**：不 import 任何 `@deepseek-ai/*`，也不 import React，因此可以在浏览器 bundle 里被内联，也便于在 Node 下单测。
- **边界处容错**：事件载荷是持久化产物，按结构读取；字段缺失只是少几个可搜索段，不抛异常。
- **只依赖公开的 DOM 契约**：`data-chat-anchor-key` / `data-chat-turn` 属性与 `[data-conversation-scroll]` 容器。

## 使用方

- [`@2elian/dsh-client-ui-session-delta-search`](../../../plugins/session-delta-search/README.md)
- [`@2elian/dsh-client-ui-session-list`](../../../plugins/session-list/README.md)

## 开发

```sh
pnpm run build
pnpm run test
pnpm run typecheck
```
