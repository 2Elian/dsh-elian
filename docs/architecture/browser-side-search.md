# 为什么搜索跑在浏览器侧

DeepSeek Harness 有两套现成的会话搜索，但都不能满足「搜到 → 跳过去」，所以这两个插件自己抽取、自己建索引、自己算锚点，全部在浏览器内完成，**不改 DSH 一行代码**。

## 现成能力的两个硬限制

### 1. 自带抽取器不索引推理内容

`packages/session-query/session-query/src/extraction.ts:74` 对 `reasoning` 块直接 `return []`。官方文档把这条写死了：

> `docs/subsystems/session-query.md:145` — "Messages, tool calls/results, todos, and failure/status detail contribute semantic text; **reasoning blocks**, blocked prompts, structural events, and stream chunks do not."

而「搜到 AI 的推理内容」正是这个插件的核心需求之一。

### 2. Web 端的会话搜索没有位置

`packages/api/session-controller/src/list.ts` 把查询限制在 current surface 的 `user/message` + `assistant/message`，返回类型是：

```ts
interface SessionSearchResultItem {
  sessionId: SessionId
  snippet: string
}
```

**没有 seq、没有 message id、没有 turn。** 拿不到位置就无法跳转——而这正是第二个核心需求。

## 为什么不用远端自己做一个搜索方法

DSH 的远端能力表是**构建期静态**的：

- `@Remote` 方法需要跑 `pnpm run build:lib` 让 Typert generator 生成 `lib/typert.remote-client.*`；
- 更要紧的是，浏览器能调用哪个命名空间由 `packages/api/remotes/src/client/index.ts` 里的一个**静态数组**决定，注释写得很直白：

> "The capability set is fixed by explicit build-time value imports; the Client does not discover the Host's active Services or Remote definitions at runtime. Additional capabilities require an explicit `/remote` value import and mount in this assembly."

也就是说，**仓库外的包无法注册新的 `ctx.remote.<namespace>`**。要么 fork DSH 改那个数组 + 跑 codegen，要么放弃这条路。

## 浏览器侧已经有的东西

反过来看，浏览器里其实什么都有：

| 需要 | 现成能力 | 位置 |
| --- | --- | --- |
| 会话事件流 | `ctx.sessions.binding(id).eventSource`，`{ entries, hasMore }` 且可 `subscribe` | `api/session-controller/client` |
| 往回翻历史 | `ctx.conversation.loadOlder()` | `client-ui-conversation` |
| 每行的稳定锚点 | `data-chat-anchor-key` / `data-chat-turn` | `ui-chat/ChatNodeSeat.tsx:126-136` |
| 锚点 key 的算法 | `` `${kind.length}:${kind}${id}` `` | `ui-conversation/conversation/conversation.ts:295` |
| 滚动容器 | `[data-conversation-scroll]` | `ui-conversation` |

事件里本来就有完整的 `assistant/message.data.message.content`，`reasoning` 块原样在里面。所以「自己抽取」只是多写一个 60 行的 switch，换来的是**不依赖宿主改动、可单测、推理内容可搜**。

## 跳转是怎么拼出来的

`ui-chat` 自己的跳转是 `ChatView.tsx:723` 的 `navigateToTurn`——组件内部的 `useCallback`，不导出、不挂在任何服务上，且只到 turn 粒度。插件拿不到它。

但它的两个关键机制是可复刻的：

1. **锚点查找**：`anchorElement()` 遍历 `[data-chat-anchor-key]:not([hidden])` 匹配 key。
2. **落点计算**：`el.scrollTop += rowTop - scrollportTop - 24`。

[`anchors.ts`](../../packages/session/delta-search/src/anchors.ts) 复刻锚点推导（每个事件给多个候选 key，因为同一事件可能只有较粗的那一行已加载），[`jump.ts`](../../packages/session/delta-search/src/jump.ts) 复刻落点，并补上 `ui-chat` 内部才有的能力：

- 行不存在时用 `loadOlder()` 翻页并等行出现（带超时）；
- 行被紧凑模式折在 `hidden="until-found"` 里时先展开再测量；
- 无 `document` 环境（单测）返回 `{ landed: false }` 而不是抛错。

## 代价

这个选择有明确代价，写在这里以免被当成没有：

- 只能索引**浏览器已加载**的事件窗口；完整历史要逐页拉。
- 依赖 `ui-chat` 的 DOM 契约（锚点属性、key 拼法、滚动容器）。上游重构会打破它，`anchors.ts` 的注释里逐条标了源文件的对应位置，便于同步。
- 直接操作滚动容器会绕过 `ui-chat` 的 follow/anchor 记账，可能把「跟随底部」状态翻掉。这是目前接受的行为。

如果将来 DSH 把 `ConversationViewRequest`（`openView(view, focus)` + `completeViewRequest()`）在 Chat 侧实现——它现在对 `conversation.view` 的每个入口都通了，**唯独 `ChatView` 不读 `viewRequest`**——那么最干净的形态是插件只发一个 focus 请求，落点交给 `ui-chat` 自己做。届时本插件的 `jump.ts` 可以整体退化成一次 `openView('chat', key)` 调用。
