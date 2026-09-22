# 安装指南

三种安装方式，按使用场景选一种。

## 前置：确认你的 profile 名

`dsh web` 用的是 `web` profile。命令行里用 `--profile web` 指定；Web 侧边栏的 Plugins 页面管的就是当前 profile。

## 方式一：从 npm 安装

适合只想用插件的人。需要插件已经[发布到 npm](publishing.md)。

### 用 Web 界面（最简单）

1. 打开 dsh Web，侧边栏进 **Plugins** 页面。
2. 在安装框里填包名，例如 `@2elian/dsh-client-ui-session-delta-search`。
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
             --patch E:/path/to/dsh-elian/plugins/session-list/dev.overlay.yml
```

- `--patch` 是 launcher flag，**必须写在 app flag 之前**。
- overlay 里的 `name: './index.js'` 是相对 patch 文件解析的。
- 只装一个插件就只传一个 `--patch`。

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
```

同样需要到 Plugins 页面勾选 bundle。

## 为什么必须先构建

`client.js` 是构建产物，不在 git 里（对 npm 包则由 `prepublishOnly` 在发布时生成）。DSH 的 `ClientModuleRegistry` 在激活时**同步**读取 `exports["./client"]`，文件不存在会让启动直接失败：

```
client bundle not found; run `pnpm run build` before launch
```

所以：**clone 之后第一次启动前一定要 `pnpm run build`。**

## 验证装上了

1. 打开任意一个会话。
2. 对话头部右侧应该多出两个按钮：放大镜（搜索）和列表（提问列表）。
3. 点放大镜，输入一个你记得出现过的词；能出结果说明索引正常。
4. 点一条结果，正文应该滚动过去并短暂描边。

## 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 启动报 `client bundle not found` | `client.js` 没构建 | `cd dsh-elian && pnpm install && pnpm run build` |
| 装了但头部没按钮 | bundle 没在 profile 里选中 | Plugins 页面勾选；命令行 `pnpm add` 不会自动启用 |
| 按钮出现但面板打不开 | 客户端插件可能在更早的版本缓存里 | 硬刷新页面；必要时重启 `dsh web` |
| 搜索结果为空但内容明显存在 | 该内容在更早未加载的历史里 | 点面板底部「加载全部历史」再搜；或先手动向上滚动加载 |
| 跳转后没滚动过去 | 目标在已加载窗口之外且翻页失败 | 面板会提示该结果在已加载范围外；先加载历史再点 |
| `pnpm run build` 报 `workspace:*` 解析失败 | 依赖没装 | 先 `pnpm install` |

## 升级与卸载

```sh
dsh plugin --profile web add @2elian/dsh-client-ui-session-delta-search   # 升级到最新
dsh plugin --profile web remove @2elian/dsh-client-ui-session-delta-search
```

或在 Plugins 页面里操作。卸载后重启 `dsh web`。
