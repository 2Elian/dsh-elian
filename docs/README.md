# 文档索引

面向使用者的安装说明在仓库根 [README](../README.md)。这里放展开内容。

| 文档 | 内容 |
| --- | --- |
| [install.md](install.md) | 安装、启用、升级、卸载、排错 |
| [development.md](development.md) | 目录结构、构建、开发循环、验证 |
| [publishing.md](publishing.md) | 发布到 npm |
| [features/](features/) | 每个插件一篇 |
| [architecture/browser-side-search.md](architecture/browser-side-search.md) | 为什么搜索在浏览器侧 |

## 功能

| 插件 | 文档 |
| --- | --- |
| `session-delta-search` | [features/session-delta-search.md](features/session-delta-search.md) |
| `session-list` | [features/session-list.md](features/session-list.md) |

## 新增一个插件

1. 逻辑放进 `packages/<分组>/<名字>/`（纯 TypeScript，零 `@deepseek-ai/*` 依赖，配 vitest 单测）。
2. 插件放进 `plugins/<名字>/`：`package.json` 声明 `dsh.client` 与 `dsh.bundle.patch`，`index.js` 是 host 半，`src/client/` 是浏览器半，`build.mjs` 三行调用 [`scripts/client-bundle.mjs`](../scripts/client-bundle.mjs)。
3. 文案进 `src/client/locales.ts`，样式进 `src/client/styles.ts`，两者都不要硬编码在组件里。
4. 在根 [README](../README.md) 的插件表加一行，在本目录 `features/` 下加一篇。
5. `pnpm run check` 必须全绿。

## 遗留目录

`docs/grasp/` 属于已废弃的 GraSP 插件原型（其核心包已删除），保留仅为历史参考，不再维护。
