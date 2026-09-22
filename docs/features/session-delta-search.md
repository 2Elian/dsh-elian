# session-delta-search

在当前对话内全局搜索关键字，点结果跳转到对应位置。

安装见 [安装指南](../install.md)。包名：`@2elian/dsh-client-ui-session-delta-search`。

## 功能特性

- **全类型覆盖**：用户提问、AI 正文、**AI 推理内容**、工具调用（名字 + 原始参数）、工具结果（含失败信息）、注入的上下文。
- **结果可跳转**：点一条结果，正文滚动到那一行并短暂描边高亮。目标不在已加载范围时自动往回翻历史页。
- **多词 AND 匹配**：空格分隔的词必须出现在同一段文本里；默认大小写不敏感的子串匹配，绝不把查询当正则。
- **按类型过滤**：勾选提问 / 回答 / 推理 / 工具调用 / 工具结果 / 注入，徽章上带各类型命中数。
- **大小写与全词**：两个开关。
- **键盘操作**：`↑` `↓` 切换选中项，`Enter` 跳转，`Esc` 关闭。
- **范围透明**：面板底部明说已索引多少条事件、历史是否加载完整；不做静默截断。点「加载全部历史」可以把整个会话翻完再搜。

## 用法

1. 打开一个会话，点对话头部右侧的**放大镜**按钮。
2. 输入关键字。
3. 结果列表每行：类型徽章、带 `<mark>` 高亮的片段、turn 号与事件 seq。
4. 点击（或 `Enter` 跳当前选中项）跳转。

## 入口位置

| 部件 | 座位 | 说明 |
| --- | --- | --- |
| 放大镜按钮 | `conversation.session.header.utilities` | 会话头部右侧，list + session scope |
| 搜索面板 | `conversation.input.overlay` | 浮在输入框上方，随会话挂载/卸载 |

## 实现要点

数据、匹配、跳转全在浏览器里，不经过宿主：

1. 从 `ctx.sessions.binding(sessionId).eventSource` 拿浏览器已持有的会话事件窗口（`{ entries, hasMore }`，可 `subscribe`）。
2. 把事件抽成可搜索文本。**关键点**：DSH 自带的文本抽取器对 `reasoning` 块返回 `''`，所以这里自己抽。详见 [架构说明](../architecture/browser-side-search.md)。
3. 查询匹配（AND of 子串）产出命中，每条带 `seq` 和用于高亮的 `before` / `match` / `after`。
4. 走 `anchors.ts` 把事件映射到 `ui-chat` 打在行上的 `data-chat-anchor-key`。
5. 走 `jump.ts` 落点：行已在 DOM 就直接滚；不在就 `loadOlder()` 翻页等行出现；被紧凑模式折起来（`hidden="until-found"`）就先展开。

核心逻辑在 [`packages/session/delta-search`](../../packages/session/delta-search/README.md)，纯 TypeScript、零依赖、22 条单测。

## 已知限制

- **只索引浏览器已加载的事件窗口**。更早的历史要翻页才能搜到；面板会提示还有未加载的部分，「加载全部历史」逐页拉取，很长的会话需要点几下。
- **跳转依赖 `ui-chat` 的 DOM 契约**（`data-chat-anchor-key` / `data-chat-turn` / `[data-conversation-scroll]`）。上游若改了 Conversation Context key 的拼法，需要同步改 [`anchors.ts`](../../packages/session/delta-search/src/anchors.ts)。
- **折叠行展开依赖 `hidden="until-found"` 属性**。改为条件渲染后需要另找展开路径。
- **不索引流式增量**（`assistant/live-chunk`），因为持久化事件会把同样的内容再交付一次，两边都索引会导致每个 token 出现两次。
- **面板位置未在真实页面验证**。`position: absolute; bottom: calc(100% + 8px)` 相对输入框上方 overlay 锚点，需要目视确认。
