# dsh-elian

dsh-elian的目的是为[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)贡献好用的插件。

## 插件

| 插件 | 类型 | 功能 | 文档 |
| --- | --- | --- | --- |
| `session-delta-search` | 客户端 | 在当前对话内全局搜关键字：提问、回答、**推理内容**、工具调用、工具结果都能搜到；点结果跳转到对应位置 | [功能说明](docs/features/session-delta-search.md) |
| `session-list` | 客户端 | 列出当前对话的全部提问：每条显示提问正文与回答摘要；点击跳转到发送该消息的位置 | [功能说明](docs/features/session-list.md) |
| `ts-learn` | host | 发 `/ts-learn` 随机出一道 TypeScript 中等题（agent 开发场景 + LeetCode 算法），浏览器里写代码、跑样例自测、提交给**会话里的 agent** 去沙箱判题点评；没过自动给提示 | [功能说明](docs/features/ts-learn.md) |

---

## 安装

### 方式一：从 npm 安装（推荐）

在 dsh 的 **Web 侧边栏 → Plugins** 页面里填包名安装，装完自动启用：

```
@2elian/dsh-client-ui-session-delta-search
@2elian/dsh-client-ui-session-list
@2elian/dsh-ts-learn
```

或者让 agent 调 `plugin_manager`：

```
action: install_bundle
target: @2elian/dsh-client-ui-session-delta-search
```

也可以走命令行，然后到 Plugins 页面手动勾选这个 bundle：

```sh
dsh plugin --profile web add @2elian/dsh-client-ui-session-delta-search
```

装完**重启 `dsh web`**，对话头部右侧会出现放大镜和列表两个按钮。

### 方式二：本地源码

```sh
git clone https://github.com/2Elian/dsh-elian.git
cd dsh-elian
pnpm install
pnpm run build          # 必须：两个客户端插件的 client.js 是构建产物
```

> `ts-learn` 是 host 插件，没有 `client.js`，不需要构建。

在 dsh 源码检出目录里加载：

```powershell
pnpm dsh web --patch E:/path/to/dsh-elian/plugins/session-delta-search/dev.overlay.yml `
             --patch E:/path/to/dsh-elian/plugins/session-list/dev.overlay.yml `
             --patch E:/path/to/dsh-elian/plugins/ts-learn/dev.overlay.yml
```

改完客户端源码要重新 `pnpm run build`，或单独跑 `node build.mjs --watch`。

### 方式三：把本地目录装进 profile

```sh
dsh plugin --profile web add file:/path/to/dsh-elian/plugins/session-delta-search
dsh plugin --profile web add file:/path/to/dsh-elian/plugins/ts-learn
```

三种方式的细节、启用步骤和排错见 [安装指南](docs/install.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [安装指南](docs/install.md) | 安装、启用、升级、卸载、排错 |
| [功能说明](docs/features/) | 每个插件一篇：功能、用法、限制、实现要点 |
| [题目契约](docs/PROBLEM_SCHEMA.md) | ts-learn 的加题规范与硬性规则 |
| [开发指南](docs/development.md) | 目录结构、构建、开发循环、验证 |
| [发布指南](docs/publishing.md) | 发布到 npm，让别人能装 |
| [架构说明](docs/architecture/browser-side-search.md) | 为什么搜索跑在浏览器侧 |

完整索引见 [docs/README.md](docs/README.md)。

## 目录结构

```
dsh-elian/
├── packages/     框架无关的逻辑库（纯 TypeScript，可单测）
├── plugins/      可安装的 dsh 插件
├── scripts/      构建、契约校验、冒烟、验证
└── docs/         文档
```

约定：`packages/` 放算法与纯函数，`plugins/` 放 DSH 集成（座位注册、文案、样式、打包）。多个插件要复用同一段逻辑时，抽到 `packages/` 下共用。

插件有两种形态：

- **客户端插件**（`session-delta-search`、`session-list`）：声明 `dsh.client`，有 host 半 `index.js` 与浏览器半 `src/client/`，`client.js` 由 `build.mjs` 产出。
- **host 插件**（`ts-learn`）：只有 `index.js` + `src/`，没有浏览器半、没有构建步骤、没有运行时依赖；注册命令、HTTP 路由与工具。

## 许可

MIT
