# ts-learn

随机出一道 TypeScript 练习题，在浏览器里作答，由**会话里的 agent** 判题并点评。

安装见 [安装指南](../install.md)。包名：`@2elian/dsh-ts-learn`。

## 功能特性

- **`/ts-learn` 随机出题**：单文件中等难度，题面是 agent 开发场景，考点是 LeetCode 风格算法。
- **浏览器答题页**：TypeScript 语法高亮、行号、`Tab`/`Shift+Tab` 缩进、括号引号自动补全、`Enter` 自动缩进；草稿存浏览器本地，刷新不丢。
- **运行自测**：只跑公开样例用例，逐个显示 ✓/✗ 与期望/实际对比，**不计入提交次数**，可以随便试。
- **提交**：跑完全部隐藏用例，并把这次提交**转交给会话里的 agent**，让它在自己的沙箱里复跑、给点评。
- **三层提示**：第一次提交没过自动给第一层；一层比一层具体；提示里不会直接给答案。
- **参考实现门槛**：提交满 3 次才解锁「看参考实现」。
- **面向新手**：初始化模板带思路注释、编译报错翻译成人话、`knowledge` 字段标出这道题会练到的 TS 与算法点。
- **零依赖零构建**：`lib/` 不是构建产物，插件没有 `dependencies`，装完即用。

题库当前 **20 道题 / 189 个用例**，覆盖 9 个 agent 开发方向：

| 方向 | 题数 | 代表算法 |
| --- | --- | --- |
| `tool-execution` 工具执行 | 4 | 贪心+时间轴模拟、拓扑排序分层 BFS、哈希分组、树 DFS |
| `agent-loop` Agent 循环 | 3 | 滑动窗口、双指针贪心 |
| `context-injection` / `system-prompt` | 4 | 分数背包贪心、二分答案、哈希去重保序、后缀和 |
| `llm-provider` / `gateway` | 3 | 固定窗口限流模拟、字符串规范化分组、哈希索引+游标 |
| `event-stream` 事件流 | 3 | k 路归并、滑动窗口计数、桶排序重排 |
| `subagent` / `skill` | 3 | 拓扑排序、LRU、编辑距离 DP + Top-K |

## 用法

### 命令

| 命令 | 作用 |
| --- | --- |
| `/ts-learn` | 随机出一道题，并打开答题页 |
| `/ts-learn next` | 换一道题（避免连续重复） |
| `/ts-learn hint` | 在会话里给当前题的下一层提示 |
| `/ts-learn status` | 看当前题目与提交次数 |
| `/ts-learn themes` | 列出 9 个出题方向 |
| `/ts-learn theme:工具执行` | 指定方向出题 |

### 怎么把命令发出去

1. 打开一个**已经存在的对话**（左侧会话列表里点一条，或先随便发一条消息把会话建起来）。
2. 在底部输入框里把 `/ts-learn` **打全**，按回车。
3. 聊天里会出现一张题目卡片（标题、方向、算法考点、题面、答题页链接），浏览器同时自动打开答题页。

三个容易踩的点：

- **不要在首页「探索未至之境」那个新建会话的输入框里发命令。** 那里还没有会话，客户端的命令目录是空的，回车不会把 `/` 开头的行发出去（输入框里的字会一直留着）。先发一条普通消息建立会话。
- **不用从 `/` 菜单里找它。** 敲 `/` 弹出来的列表是**技能**和几个内置指令（Compact / Permission / Model / Export），第三方插件的命令不在那个菜单里；把名字打全、直接回车即可。
- **同一个会话同时只能被一个 DSH 进程打开。** 如果你同时跑着两个 `dsh web`（比如 3080 和 3081）并想操作同一个会话，后启动的那个会报
  `session/writer-held: session "..." is already owned by an active write handle`，
  命令目录加载失败，输入框同样发不出命令。这是 DSH 的单写者保护，不是插件问题——用哪个实例就只在那个实例里操作。

### 答题页

| 操作 | 说明 |
| --- | --- |
| **运行自测** | 只跑公开样例用例，不计入提交次数 |
| **提交** | 跑完全部隐藏用例 + 转交 agent 点评 |
| **要提示** | 手动要下一层提示 |
| **看参考实现** | 提交满 3 次后出现 |
| **换一题 / 出题方向** | 右上角 |
| 快捷键 | `Tab` 缩进 · `Shift+Tab` 反缩进 · `Ctrl+Enter` 自测 · `Ctrl+Shift+Enter` 提交 |

## 判题流程

```
/ts-learn
  └─ ctx.commands.register()            全局命令，不进入模型上下文
       └─ 抽题 + 建回合 + 给出答题页 URL（可选自动打开浏览器）

答题页（挂在 dsh web 自己的 HTTP 服务器上）
  ├─ GET  /ts-learn/                    页面（严格 CSP，无内联脚本）
  ├─ GET  /ts-learn/app.css | app.js
  └─ POST /ts-learn/api/{challenge,new,run,submit,hint,solution,review,handoff}

提交
  ├─ 子进程跑完全部用例                    → 页面立刻看到逐用例结果
  ├─ agent.followup(冻结的 UserMessage)    → 转交给会话里的 agent
  └─ ctx.tools.register(ts_learn_report)   → agent 结构化回传点评
```

转交给 agent 的那条消息里包含：题号、要导出的函数名、这是第几次提交、插件本地跑出的判定、**完整的用例清单（含隐藏用例）**，以及点评要求——**先在沙箱里复跑再下结论**；第 1 次失败只给方向不给答案，第 2 次可以更具体，第 3 次之后才讲完整思路。

agent 复跑完调用 `ts_learn_report` 回传，页面轮询到就显示。**页面只展示这个工具的返回值**，写在聊天正文里的点评不会出现在页面上。

## 配置

配置写在本插件的 [cordis.patch.yml](../../plugins/ts-learn/cordis.patch.yml) 那一行里，可以被后续 patch 层覆盖。写错会在插件加载时直接报错并指出字段名，不会静默忽略。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `openBrowser` | `true` | 发命令时自动打开浏览器 |
| `promptSection` | `true` | 贡献一段简短的「新手点评礼仪」提示词 |
| `autoReview` | `true` | 提交后自动转给 agent 点评 |
| `allowRemote` | `false` | 服务器绑到 `0.0.0.0` 时是否允许非本机请求 |
| `runTimeoutMs` | `15000` | 一次运行的总超时 |
| `caseTimeoutMs` | `4000` | 每个用例的预算；总超时 = `min(两者相乘, runTimeoutMs)` |
| `memoryMb` | `256` | 判题子进程的 V8 堆上限 |
| `workDir` | `""` | 判题临时目录，默认 `<系统临时目录>/dsh-ts-learn` |
| `maxChallenges` | `32` | 内存里保留的回合数上限（LRU） |
| `recentProblemWindow` | `5` | 避免连续重复的最近题目窗口 |
| `routePrefix` | `/ts-learn` | 页面路径 |
| `maxSourceBytes` | `200000` | 单次提交的代码字节上限 |

## 实现要点

- **零运行时依赖、零构建**。`index.js` 是 host 半，`src/` 是全部实现。这是本仓库里唯一不需要 `build.mjs` 的插件：它没有浏览器半，也没有客户端 bundle 契约要满足。
- **`inject` 只要求必需服务**。这个版本的 Cordis 里 `inject` 是全有或全无的，所以只写 `['commands', 'webServer']`；`tools` 与 `systemPrompt` 各开一个嵌套 `ctx.inject` fiber，缺了只是少一个功能，不会让整个插件不加载。
- **一切注册都走 `ctx.effect`**。卸载插件行时，命令、路由、工具、提示段会一起回滚。
- **答案与隐藏用例绝不下发浏览器**。服务端只投影公开字段（`problemForClient`）。自测只下发 `public: true` 的用例。
- **执行是进程级隔离的**。每次运行建一个临时目录，写入 `submission.ts` + 用例 + 驱动，用当前 Node 直接跑（Node 22.18+ / 24 原生剥离类型，不需要编译），带内存上限、总超时、清理过的环境变量（不继承 `DEEPSEEK_API_KEY` 等）。
- **回合状态在内存里**。它是绑定活 agent 的教学回合，不是持久用户数据；重启后旧链接失效，重发一次 `/ts-learn` 即可（浏览器里的草稿还在）。

## 题目契约与加题

契约写在 [`docs/PROBLEM_SCHEMA.md`](../../docs/PROBLEM_SCHEMA.md)。加一道题：

1. 在 `plugins/ts-learn/src/problems/<方向>.js` 的 `problems` 数组里加一个对象；
2. 跑 `pnpm run check:ts-learn-bank plugins/ts-learn/src/problems/<文件>.js`；
3. 全库跑 `pnpm run verify:ts-learn`。

契约是**被执行**的，不是被描述的：字数、`knowledge` 前缀、`starter` 里的 `TODO`、`signature` 形参个数与每个用例 `args` 长度是否一致，都会被校验；参考实现必须在真实子进程里跑通全部用例，起始模板必须至少失败一个。

## 验证

| 命令 | 覆盖 |
| --- | --- |
| `pnpm run validate` | 清单契约（host 插件分支：bundle patch、files、host 入口可 import 且导出 `apply`） |
| `pnpm run verify:ts-learn` | 122 项静态 + 40 项编辑器行为 + 20 道题 189 个用例真实执行 + 88 项端到端 + 25 项真实浏览器 |
| `pnpm run check:ts-learn-bank [文件]` | 单文件或整库的题目契约与行为 |

`verify:ts-learn` 的四段：

1. `verify-ts-learn.mjs` —— 包清单、patch/overlay、配置校验、题库完整性、下发投影、回合状态、消息构造、资源文件，以及**把 `app.js` 真实源码加载进 `node:vm` 跑语法高亮与缩进**。它的 DOM 桩只认 `index.html` 与 `app.js` 真正声明过的 id，其他 id 一律返回 `null`，所以「JS 找了一个页面上不存在的元素」会立刻被抓出来。
2. `verify-ts-learn-problems.mjs` —— 20 道题 / 189 个用例的真子进程执行。
3. `verify-ts-learn-http.mjs` —— 真实 Cordis + dsh 检出里已构建的 `@deepseek-ai/dsh-host-webserver`，只有 `commands` / `tools` / `systemPrompt` 三个注册目标用桩替代；跑完整 HTTP 流程含真实提交、agent 转交与工具回传。
4. `verify-ts-learn-page.mjs` —— **真实浏览器**打开答题页：断言题目真的渲染出来、编辑器预填起始模板、点「运行自测」全过、点「提交」转交给 agent、点「要提示」出提示、换方向换题。前三段都盖不到「接口正常但页面空白」这类故障，这一段专门盖它。

前三段需要 dsh 源码检出（默认 `E:/Project/deepseek-harness`）；第 4 段还需要一个浏览器（依次尝试 Playwright 自带内核、系统 Edge、系统 Chrome），一个都没有时打印 SKIP 并以 0 退出，不会让别人的 `pnpm run check` 挂掉。

## 已知限制

- **本地自测不受 DSH 沙箱约束**。插件在自己的子进程里跑你的代码（限制超时/内存/环境变量，但不隔离文件系统与网络）。权威判定来自 agent 在自己的沙箱里复跑。它是给自己练手用的，别拿它跑陌生人的代码。
- **没有 agent 点评的预览模式**。`pnpm run preview:ts-learn` 只证明界面与判题，点评需要真装进 DSH。
- **页面是独立网页，不是嵌进 GUI 的面板**。做成 GUI 内的 seat 需要客户端插件与前端构建；现在的做法换来零构建、任何 profile 都能装。
- **回合状态在内存里**，重启后旧答题链接失效。
- **`allowRemote` 默认关闭**。如果 web server 绑到了 `0.0.0.0`，插件会拒绝非本机请求——否则一个本地练题页面会变成局域网里可执行代码的入口。
