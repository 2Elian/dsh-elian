# @2elian/dsh-ts-learn

在 DeepSeek Harness 里随机出 TypeScript 练习题：发一次 `/ts-learn`，插件给出一道单文件中等难度的题，打开浏览器里的答题页，并在你提交后让**会话里的 agent** 去沙箱里复跑、给点评。

题面是 agent 开发场景（agent loop、LLM 调用与 provider 适配、工具执行、上下文注入、system prompt、skill、gateway、事件流、子代理），考点是 LeetCode 风格的中等算法。面向 TypeScript 新手。

## 安装

```
@2elian/dsh-ts-learn
```

在 dsh Web 的 **Plugins** 页面里安装，或：

```sh
dsh plugin --profile web add @2elian/dsh-ts-learn
```

命令行装完还要到 Plugins 页面勾选这个 bundle，然后重启 `dsh web`。

这个插件是 **host 插件**：没有浏览器半，也没有构建步骤——`index.js` 和 `src/` 就是全部源码，装完即用。

完整安装说明、开发加载方式与排错见 [安装指南](../../docs/install.md)。

## 用法

在对话里发：

```
/ts-learn
```

浏览器会自动打开答题页。页面里 `Tab` / `Shift+Tab` 缩进，`Ctrl+Enter` 跑样例自测，`Ctrl+Shift+Enter` 提交。第一次没通过会自动给一层提示。

其它子命令：`/ts-learn next`、`/ts-learn hint`、`/ts-learn status`、`/ts-learn themes`、`/ts-learn theme:工具执行`。

## 不装进 DSH 也能先看

在仓库根：

```sh
pnpm run preview:ts-learn
```

它会起一个独立预览服务器（真实判题，但没有 agent 点评），适合先看界面和题面。

## 配置

配置写在 [cordis.patch.yml](cordis.patch.yml) 的这一行里，可以被后续 patch 层覆盖。常用字段：`openBrowser`、`promptSection`、`autoReview`、`runTimeoutMs`、`caseTimeoutMs`、`memoryMb`、`routePrefix`、`allowRemote`。完整表格与默认值见 [`docs/features/ts-learn.md`](../../docs/features/ts-learn.md#配置)。

## 更多

功能特性、题目契约、判题流程、验证方式、已知限制见 [`docs/features/ts-learn.md`](../../docs/features/ts-learn.md)。
