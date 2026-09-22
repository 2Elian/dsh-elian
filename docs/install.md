# 安装指南

三种安装方式，按使用场景选一种。

## 前置：确认你的 profile 名

`dsh web` 用的是 `web` profile。命令行里用 `--profile web` 指定；Web 侧边栏的 Plugins 页面管的就是当前 profile。

## 按插件选路径

本仓库有两种插件，装的步骤不一样：

| 插件 | 形态 | 需要 `pnpm run build` 吗 |
| --- | --- | --- |
| `session-delta-search`、`session-list` | 客户端插件（有浏览器半） | **需要**：`client.js` 是构建产物 |
| `ts-learn` | host 插件（无浏览器半） | **不需要**：`index.js` + `src/` 就是全部源码 |

## ts-learn 怎么启动

三种方式，按你想做的事选。

### A. 只看界面和题面（不装进 DSH）

```sh
cd E:\Project\dsh-elian
pnpm install
pnpm run preview:ts-learn
```

会起一个独立预览服务器并自动打开答题页。判题是真的（真开子进程跑你写的 TypeScript），只是**没有 agent 点评**——提交时终端会打印「本来要发给 agent 的评审请求」。

### B. 用 dev overlay 跑在真实 DSH 里（开发用）

```powershell
cd E:\Project\deepseek-harness
pnpm dsh --profile web --patch E:/Project/dsh-elian/plugins/ts-learn/dev.overlay.yml
```

启动后在对话里发 `/ts-learn`。overlay 让 DSH 直接加载仓库里的源码，不改 profile；改了源码重启 DSH 即生效。

### C. 正式装进 profile（日常用）

```sh
cd E:\Project\deepseek-harness
pnpm dsh plugin --profile web add "file:E:\Project\dsh-elian\plugins\ts-learn"
```

装完打开 Web 侧边栏 **Plugins** 页面，把 `@2elian/dsh-ts-learn` 的开关**打开**，再重启 `dsh web`。

启动后在对话里发 `/ts-learn`，浏览器自动打开答题页（没自动打开就用命令结果里给出的链接）。

### 验收

```sh
pnpm dsh --profile web --dump-config | Select-String "ts-learn"
```

能看到 `ts-learn` 这一行，说明组合里已经有它了。这个命令不需要 API key。

## 方式一：从 npm 安装

适合只想用插件的人。需要插件已经[发布到 npm](publishing.md)。

### 用 Web 界面（最简单）

1. 打开 dsh Web，侧边栏进 **Plugins** 页面。
2. 在安装框里填包名，例如 `@2elian/dsh-client-ui-session-delta-search` 或 `@2elian/dsh-ts-learn`。
3. 确认安装。管理器会装包并**自动启用**这个 bundle。
4. 重启 `dsh web`。

### 用 agent 的 `plugin_manager` 工具

在对话里让 agent 调：

```
action: install_bundle
target: @2elian/dsh-client-ui-session-delta-search
```

`target` 支持三种形式：注册表包名、绝对路径、git 地址。装完后重启。

### 用命令行

```sh
dsh plugin --profile web add @2elian/dsh-client-ui-session-delta-search
```

这条命令只是把 `pnpm add` 转发到 profile 目录，**不会自动启用 bundle**。装完还必须到 Plugins 页面勾选它，否则 patch 层不生效。

## 方式二：从本地源码加载（开发用）

改代码时用这个，不用发布。

```sh
git clone https://github.com/2Elian/dsh-elian.git
cd dsh-elian
pnpm install
pnpm run build
```

然后在 dsh 源码检出目录执行：

```powershell
pnpm dsh web --patch E:/path/to/dsh-elian/plugins/session-delta-search/dev.overlay.yml `
             --patch E:/path/to/dsh-elian/plugins/session-list/dev.overlay.yml `
             --patch E:/path/to/dsh-elian/plugins/ts-learn/dev.overlay.yml
```

- `--patch` 是 launcher flag，**必须写在 app flag 之前**。
- overlay 里的 `name: './index.js'` 是相对 patch 文件解析的。
- 只装一个插件就只传一个 `--patch`。
- 客户端插件的 overlay 需要先 `pnpm run build`；`ts-learn` 的 overlay 不需要。

### ⚠️ launcher flag 与 app flag 的顺序

dsh 的命令行分两层：**launcher 的 flag**（`--profile`、`--patch`、`--dump-config`）和 **app 自己的 flag**（web 的 `--port`、`--open`、`--no-open` 等）。launcher 只解析自己认识的 token，**一旦遇到不认识的 token（比如 `--port`），从它开始后面所有参数都原样交给 app**。

所以 `--patch` 写在 `--port` 后面就会被当成 app 参数，报：

```
error: unknown option '--patch'
```

| 写法 | 结果 |
| --- | --- |
| `pnpm dsh web --patch A.yml --port 3081` | ✅ launcher 先吃掉 `--patch`，`--port 3081` 交给 app |
| `pnpm dsh --profile web --patch A.yml --port 3081` | ✅ 同上，显式指定 profile |
| `pnpm dsh web --port 3081 --patch A.yml` | ❌ `--port` 触发交接，`--patch` 被丢给 app |

多个 overlay 就重复写 `--patch`（它是可重复的单值选项，不是变参）：

```powershell
pnpm dsh --profile web `
  --patch E:/Project/dsh-elian/plugins/session-delta-search/dev.overlay.yml `
  --patch E:/Project/dsh-elian/plugins/session-list/dev.overlay.yml `
  --port 3081
```

想确认某个 flag 属于哪一层：`dsh -h` 打 launcher 的 help，`dsh web --help` 打 web app 自己的。

改完客户端源码后重新 `pnpm run build`。想在保存时自动重建：

```sh
node build.mjs --watch        # 在两个插件目录各跑一个，或见 scripts/
```

运行中的 `dsh web` 会轮询 `client.js` 的修改时间，产物一变就热替换，不用重启服务。

## 方式三：把本地目录装进 profile

想让它像正式安装一样持久存在，但不想发 npm：

```sh
dsh plugin --profile web add file:/path/to/dsh-elian/plugins/session-delta-search
dsh plugin --profile web add file:/path/to/dsh-elian/plugins/ts-learn
```

同样需要到 Plugins 页面勾选 bundle。

## 为什么客户端插件必须先构建

> 这一节只适用于 `session-delta-search` 与 `session-list`。`ts-learn` 是 host 插件，没有 `client.js`，不需要构建。

`client.js` 是构建产物，不在 git 里（对 npm 包则由 `prepublishOnly` 在发布时生成）。DSH 的 `ClientModuleRegistry` 在激活时**同步**读取 `exports["./client"]`，文件不存在会让启动直接失败：

```
client bundle not found; run `pnpm run build` before launch
```

所以：**clone 之后第一次启动前一定要 `pnpm run build`。**

## 验证装上了

### 客户端插件（session-delta-search / session-list）

1. 打开任意一个会话。
2. 对话头部右侧应该多出两个按钮：放大镜（搜索）和列表（提问列表）。
3. 点放大镜，输入一个你记得出现过的词；能出结果说明索引正常。
4. 点一条结果，正文应该滚动过去并短暂描边。

### ts-learn

1. 在任意会话里发 `/ts-learn`。
2. 应该返回一段题面，并给出一条 `http://127.0.0.1:<port>/ts-learn/?c=...` 链接；没自动打开浏览器的话手动点开。
3. 打开后左上角显示题目标题、方向与算法考点；右侧可以写代码、点「运行自测」。
4. 点「提交」后页面会出现「Agent 正在沙箱里复跑你的代码…」，随后显示出点评——这说明命令、HTTP 路由、提交转交、工具回传四条链路都通了。

## 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 启动报 `client bundle not found` | `client.js` 没构建 | `cd dsh-elian && pnpm install && pnpm run build` |
| 装了但头部没按钮 | bundle 没在 profile 里选中 | Plugins 页面勾选；命令行 `pnpm add` 不会自动启用 |
| 按钮出现但面板打不开 | 客户端插件可能在更早的版本缓存里 | 硬刷新页面；必要时重启 `dsh web` |
| 搜索结果为空但内容明显存在 | 该内容在更早未加载的历史里 | 点面板底部「加载全部历史」再搜；或先手动向上滚动加载 |
| 跳转后没滚动过去 | 目标在已加载窗口之外且翻页失败 | 面板会提示该结果在已加载范围外；先加载历史再点 |
| `pnpm run build` 报 `workspace:*` 解析失败 | 依赖没装 | 先 `pnpm install` |
| 发 `/ts-learn` 提示「不认识的用法」 | 命令行里混进了别的字符（比如从别处粘过来的文字） | 清空输入框，只打 `/ts-learn` 再回车 |
| 发 `/ts-learn` 回车没反应，字还留在输入框 | 当前还没有会话（在首页「新建会话」那里），或命令目录没加载出来 | 先随便发一条普通消息建立会话，再发命令；仍不行就刷新页面 |
| 页面顶部弹 `session/writer-held ... active write handle` | 同一个会话被另一个 `dsh web` 进程占着（单写者保护） | 只在一个实例里操作；把多余的 `dsh web` 关掉 |
| 发 `/ts-learn` 有题面但页面打不开 | web server 没起来，或端口不对 | 用命令结果里的完整链接；确认 dsh web 正常显示 GUI |
| 答题页打开了但左边没有题目 | 页面 JS 出错了（历史版本的问题，已修） | 刷新页面（`Ctrl+Shift+R`）；确认插件是最新的 |
| 页面提示「这个挑战已经失效了」 | 插件重启过，回合状态在内存里 | 重新发一次 `/ts-learn`（浏览器里的代码草稿还在） |
| 提交后页面一直等点评 | agent 还没跑完，或 `autoReview` 被关了 | 回 DSH 对话看 agent 的完整分析；重启一次会话再提交 |
| 页面提示「代码没能通过 Node 的解析」 | 提交的代码有语法错误 | 按提示里的原始报错改；`enum` / `namespace` 这类需要转换的语法在当前 Node 下不支持 |

## 升级与卸载

```sh
dsh plugin --profile web add @2elian/dsh-client-ui-session-delta-search   # 升级到最新
dsh plugin --profile web add @2elian/dsh-ts-learn
dsh plugin --profile web remove @2elian/dsh-client-ui-session-delta-search
dsh plugin --profile web remove @2elian/dsh-ts-learn
```

或在 Plugins 页面里操作。卸载后重启 `dsh web`。
