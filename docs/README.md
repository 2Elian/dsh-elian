# 文档索引

面向使用者的安装说明在仓库根 [README](../README.md)。这里放展开内容。

| 文档 | 内容 |
| --- | --- |
| [install.md](install.md) | 安装、启用、升级、卸载、排错 |
| [development.md](development.md) | 目录结构、构建、开发循环、验证 |
| [publishing.md](publishing.md) | 发布到 npm |
| [PROBLEM_SCHEMA.md](PROBLEM_SCHEMA.md) | ts-learn 的题目契约：字段规范、提示写法、硬性规则 |
| [features/](features/) | 每个插件一篇 |
| [architecture/browser-side-search.md](architecture/browser-side-search.md) | 为什么搜索在浏览器侧 |

## 功能

| 插件 | 文档 |
| --- | --- |
| `session-delta-search` | [features/session-delta-search.md](features/session-delta-search.md) |
| `session-list` | [features/session-list.md](features/session-list.md) |
| `ts-learn` | [features/ts-learn.md](features/ts-learn.md) |

## 新增一个插件

先决定形态，两种插件的接口面完全不同。

### 客户端插件（有浏览器半）

1. 逻辑放进 `packages/<分组>/<名字>/`（纯 TypeScript，零 `@deepseek-ai/*` 依赖，配 vitest 单测）。
2. 插件放进 `plugins/<名字>/`：`package.json` 声明 `dsh.client` 与 `dsh.bundle.patch`，`index.js` 是 host 半，`src/client/` 是浏览器半，`build.mjs` 三行调用 [`scripts/client-bundle.mjs`](../scripts/client-bundle.mjs)。
3. 文案进 `src/client/locales.ts`，样式进 `src/client/styles.ts`，两者都不要硬编码在组件里。
4. 在根 [README](../README.md) 的插件表加一行，在本目录 `features/` 下加一篇。
5. `pnpm run check` 必须全绿。

### host 插件（没有浏览器半）

`ts-learn` 是这种形态的样板：只注册命令、HTTP 路由、工具、提示段，不碰前端。

1. 插件放进 `plugins/<名字>/`：`package.json` 只声明 `dsh.bundle.patch`（**不要**写 `dsh.client`），`index.js` 是插件的全部入口，实现放 `src/`。
2. **不要建 `lib/`**：仓库 `.gitignore` 忽略了 `lib/`，那是客户端插件的构建产物目录；host 插件的源码必须是 `src/` 或根级 `.js`，否则提交不进 git。
3. **不写 `build.mjs`**：没有构建步骤，`.js` 就是交付物。`index.js` 必须是纯 JavaScript——Loader 直接 import 它。
4. 有运行时配置的话，在 `cordis.patch.yml` 的 `config` 里给出默认值，并加一份 `dev.overlay.yml`（row 的 `name` 用**绝对 `file:///` URL**，见 [development.md](development.md)）。
5. 客户端 bundle 契约不适用；[`scripts/validate-plugins.mjs`](../scripts/validate-plugins.mjs) 会自动走 host 分支，校验 patch、`files` 与 host 入口能被 import 且导出 `apply()`。
6. 自带验证脚本放进 `scripts/`，并在根 `package.json` 加一条 `verify:<名字>`。

## 遗留目录

`docs/grasp/` 属于已废弃的 GraSP 插件原型（其核心包已删除），保留仅为历史参考，不再维护。
