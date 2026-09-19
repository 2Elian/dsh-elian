# dsh Web 调试教程（VS Code Attach 方式）

> 目标：让 `dsh web` 正常启动后，从浏览器发一条消息，VS Code 能在主进程的
> TypeScript 源码断点处停住；并且你新开发的插件（R1 提示词注入、后续 R2–R7
> 的实验插件）也一起参与调试。
> 全部命令在本仓库根目录（`E:\Project\deepseek-harness`）执行，均已实测。

## 0. 一句话流程（TL;DR）

```bash
# 终端 A：带 inspector 启动 web（launcher flags 必须在 app flags 之前！）
node --inspect=9229 --import tsx/esm apps/cli/src/bin.ts web --patch ./scratch-plugin/cordis.yml --no-open
```

1. 等终端出现 `Debugger listening on ws://127.0.0.1:9229/...` 和
   `dsh web: http://127.0.0.1:3080/?token=...`。
2. VS Code：Run and Debug（Ctrl+Shift+D）→ 选 **Attach: dsh web (9229)** → F5。
3. 浏览器打开终端打印的 URL，配置模型，发消息 → 断点命中。

## 1. 调试原理：一个主进程，两条“调试面”

dsh web 启动后只有一个 Node 主进程，它同时是：

- Web 服务器 + API gateway（`http://127.0.0.1:3080`）；
- agent loop 宿主：浏览器消息 → WebSocket(remote events) → session controller →
  agent loop → `systemPrompt.assemble()` → LLM → 工具执行，全部在这个进程里。

证据（实测）：

- inspector 列表里进程 title 是 `apps/cli/src/bin.ts`；
- 抛错时的调用栈直接指向 `.ts` 源码，例如
  `packages/core/system-prompt/src/index.ts`；
- 源码运行（`node --import tsx/esm`）由 tsx 按仓库 tsconfig 路径把
  `@deepseek-ai/*` 映射到各包 `src/`，所以 VS Code 断点可以**直接打在 .ts 上**，
  不需要管 `lib/` 产物。

因此：**attach 一次 9229，就能调试宿主、agent loop、systemPrompt 和你自己的
插件**。浏览器里的 React UI 是另一条调试面，要用浏览器 DevTools（见 §8）。

## 2. 仓库已备好 VS Code 配置

`.vscode/launch.json`（已存在，被 git 忽略、不提交）里有两个配置：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach: dsh web (9229)",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "sourceMaps": true,
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Launch: dsh web (tsx)",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "node",
      "runtimeArgs": ["--import", "tsx/esm"],
      "program": "${workspaceFolder}/apps/cli/src/bin.ts",
      "args": ["web"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "sourceMaps": true,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

- **Attach**：你倾向的方式，进程独立在终端里跑，VS Code 随时挂上去。
- **Launch**：备选，VS Code 自己拉起进程，不需要手动 `--inspect`。

 A. 想抓启动期代码（构造函数 / apply / section 注册）

  用 --inspect-brk 让进程停在第一行等调试器，attach 后按继续（F5）再开始执行：

  node --inspect-brk=9229 --import tsx/esm apps/cli/src/bin.ts web --patch ./scratch-plugin/cordis.yml --no-open

  VS Code attach（配置不变），然后 F5 继续——boot 过程中就会在构造函数/apply 处停住。

  B. 想抓"发消息后"的代码（运行期）

  不要在构造函数下断点，改在 assemble()（packages/core/system-prompt/src/index.ts:536）下断点——每个模型 step 之前都会调用它：

  1. 正常 --inspect=9229 启动并 attach（你已经会了）；
  2. 在 async assemble(...) 函数体第一行下断点；
  3. 浏览器（Chrome 152 / Edge）里确认已配置模型和 API key、选中工作区；
  4. 发"你好" → 请求进入 agent loop → 组装提示词 → 断点命中。

## 3. 方式 A：Attach（推荐）

### 3.1 终端启动

```powershell
node --inspect=9229 --import tsx/esm apps/cli/src/bin.ts web --patch ./scratch-plugin/cordis.yml --no-open
```

说明：

- `pnpm dsh web` 内部就是 `node --import tsx/esm apps/cli/src/bin.ts`，但 pnpm
  脚本不能传 Node 的 `--inspect`，所以 attach 时必须写这条裸 node 命令。
- **`--patch` 是 launcher flag，必须出现在 app flag（如 `--no-open`）之前**；
  `--no-open` 可选，加上可避免自动打开浏览器。
- 想等 VS Code 挂上再执行代码（用于抓启动期断点）：

```powershell
node --inspect-brk=9229 --import tsx/esm apps/cli/src/bin.ts web --patch ./scratch-plugin/cordis.yml --no-open
```

### 3.2 VS Code 挂载

1. 打开 Run and Debug（Ctrl+Shift+D）；
2. 下拉选 **Attach: dsh web (9229)**；
3. F5 启动调试会话。

时序注意：

- **启动期断点**（插件 `apply`、`section()`）：用 `--inspect-brk`，attach 后按
  继续（F5），进程才真正开始执行，断点必中。
- **运行期断点**（每条消息必经的 `assemble()`、工具 `execute()`）：正常
  `--inspect=9229` 启动、attach 后随时加断点即可，不必重启。

> 常见误解：`--inspect-brk` 停到第一行后**只需按一次 F5（Continue）**，调试器
> 会直接运行到你的断点；不要用 F10/F11 单步去"跳"过启动代码，那样会很久。
>
> 想要"不重启进程就重新执行插件启动代码"时，用 HMR：正常启动并 attach 后，
> 在插件 `apply()` 处下断点，然后随便改一下插件源码并保存——热替换会先卸载
> 旧插件再执行新 `apply()`，断点正好命中，全程无需 `--inspect-brk` 和重启。

### 3.3 浏览器触发

1. 打开终端打印的 `http://127.0.0.1:3080/?token=...`（token 在 URL 里，直接访问
   3080 会 401）；
2. 设置 → 模型，配置 API key（没有 key 时模型步骤走不到，但启动期断点仍可调）；
3. 选择工作区；
4. 发一条消息，例如 “List the plugins currently loaded.”

## 4. 断点放哪里（核心推荐）

| 想观察什么 | 断点位置 | 何时命中 |
|---|---|---|
| 你的插件被加载 | `tmp/r1-prompt/route1-web.ts` 的 `apply()` / `ctx.systemPrompt.section(...)` | 启动时 |
| 每条模型请求必经的提示词组装 | `packages/core/system-prompt/src/index.ts:536` 的 `async assemble()` | 每次发送消息后、每个模型 step 前 |
| 组装排序与你的区块 | `packages/core/system-prompt/src/index.ts:573`（`sectionDefinitions` 排序处） | 同 assemble |
| 模型发起工具调用 | `packages/core/tools/src/index.ts:1333` 的 `async execute()` | 模型每次调工具 |
| agent loop 本体 | `packages/core/agent-loop/src/index.ts:359`（`class AgentLoop`） | 会话驱动时 |
| 你的 R1 区块文本解析 | `renderPrompt()` / `interpolate()`（`system-prompt/src/index.ts:263 / 336`） | 每次组装 |

在 `assemble()` 停住后建议看：

- **Call Stack**：往上能看到 agent loop 调用链，往下是 `section()` 注册来源；
- **Variables → assembly**：`sections` 数组顺序
  `harness:identity(-1000) → deployment:persona(0) → skill-author:workflow(30000)`，
  直观证明 R1 是“追加”而不是“替换”；
- **Variables → context**：`scope`、`model`、`cwd` 由 agent loop 提供——这也是
  R1 原 demo 在真实 web 里手动 `assemble()` 会报
  `unknown prompt variable "{{model}}"` 的原因（见 §7）。

## 5. 让你新开发的东西一起被调试

### 5.1 用 patch overlay 把实验插件插进 web 组合

调试 overlay 已建好：`scratch-plugin/cordis.yml`

```yaml
# Web profile 的调试 overlay：把 R1 实验插件插进真实 dsh web 组合。
- insert:
    - id: route1-web
      name: 'file:///E:/Project/deepseek-harness/tmp/r1-prompt/route1-web.ts'
      config:
        enabled: true
```

要点：

- `name` 是插件模块说明符。Windows 下必须写 `file:///E:/...` 这种文件 URL，
  不能写 `E:\...` 或 `E:/...`（后者会被当成裸包名/协议名）；
- `id` 保持稳定，HMR/配置热更新才能识别“同一行”；
- 之后每开一条新路线（R2–R7），在 `scratch-plugin/` 下放新目录，再往这个
  overlay 里加一行即可，多插件可以同时插进 web 一起断点。

### 5.2 推荐的自研代码断点组合

1. 你的插件 `apply()`：确认插件确实被 web 组合加载（实测日志：
   `[route1-web] skill-author:workflow registered (order 30000)`）。
2. 你的区块在真实提示词里的位置：断 `SystemPrompt.assemble()`，看 sections。
3. 后续 R3 做工具时：断你自己的 `execute()`，或在
   `ToolRuntime.execute()` 拦所有工具调用，确认模型真的调用了你的工具。
4. 想观察“卸载/热重载”：断 `Fiber._unload()`（`vendor/cordis/src/fiber.ts`），
   然后改 `scratch-plugin/cordis.yml` 或插件源码，保存触发 HMR。

## 6. 方式 B：Launch（备选，不想手动 attach 时）

1. Run and Debug → 选 **Launch: dsh web (tsx)** → F5；
2. VS Code 自动用 `node --import tsx/esm apps/cli/src/bin.ts web` 拉起进程并
   自动附加，断点直接生效；
3. 需要 patch 时给 `launch.json` 的 `args` 加上
   `"--patch", "./scratch-plugin/cordis.yml", "--no-open"`。

Launch 适合“点一下就开始”，Attach 适合“进程独立管理、随时挂载”。两者断点
行为一致。

## 7. 真实踩坑记录（教学价值）

把 R1 原 demo（`route1-prompt.ts`，含手动 `setTimeout → assemble()`）插进真实
web 后启动，得到：

```text
=== 注入后的 system prompt ===
dsh: fatal load failure: Error: unknown prompt variable "{{model}}" in section "deployment:persona"
    at interpolate (packages\core\system-prompt\src\index.ts:336:13)
    at renderPrompt (packages\core\system-prompt\src\index.ts:265:21)
    at Timeout._onTimeout (tmp\r1-prompt\route1-prompt.ts:38:17)
```

三个结论：

1. **真实 web 里不要手动 `assemble()`**：agent loop 每次请求都会以正确的
   agent scope 调用 `assemble()` 并提供 `model`/`cwd` 变量；插件代码里手动调用
   缺少这些变量，严格插值直接抛错（fail loud，正是 dsh 的设计）。
2. **错误栈本身就是调用路径教学**：从你的 `route1-prompt.ts:38` → `renderPrompt`
   → `interpolate`，一眼看清“谁的代码、经过哪、在哪炸”。
3. 因此 web 调试要用**无演示副作用的变体** `route1-web.ts`（注册逻辑相同，
   去掉手动 assemble）。原版 `route1-prompt.ts` 保留给教程启动器实验。

## 8. 常见问题（FAQ）

**attach 连不上 / 列表为空**

- 确认先启动了进程，终端有 `Debugger listening on ws://127.0.0.1:9229/...`；
- 端口被占时换端口：`node --inspect=9230 ...`，并把 launch.json 的 `port`
  改成 9230；
- 查端口占用：`netstat -ano | findstr 9229`；
- Windows 防火墙首次可能拦截 VS Code 连接 9229，允许即可（本地回环一般不受限）。

**断点是灰的 / 不停**

- 先确认代码真的被执行：看终端日志（如 route1-web 的注册日志）；
- 启动期代码要 attach 在进程启动前（`--inspect-brk`）或重启进程；
- 确认 attach 的是对的进程（title 应为 `apps/cli/src/bin.ts`）；
- 改完源码后重启进程再断，别让旧进程继续跑。
- `--inspect-brk` 后不要单步：attach 完成按一次 F5（Continue）直达断点。

**我想断浏览器里的 React UI**

- UI 代码在浏览器里跑，用 F12 DevTools 的 Sources 断点；VS Code 的 node attach
  只覆盖主进程（宿主/agent loop/插件）。两者要分开调试。

**终端中文乱码**

```powershell
chcp 65001
```

或在启动前执行 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`。

**退出后端口还被占**

- 在启动进程的终端按 Ctrl+C 正常关停；残留进程用
  `netstat -ano | findstr 3080` 找到 PID 后 `taskkill /PID <pid> /F`。

## 9. 关联文件

- VS Code 配置：`.vscode/launch.json`
- 调试 overlay：`scratch-plugin/cordis.yml`
- R1 web 变体插件：`tmp/r1-prompt/route1-web.ts`
- R1 原版演示插件：`tmp/r1-prompt/route1-prompt.ts`
- systemPrompt 源码：`packages/core/system-prompt/src/index.ts`
- 学习手册：`scratch-plugin/LEARNING.md`
