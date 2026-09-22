# @2elian/dsh-client-ui-session-delta-search

在 DeepSeek Harness Web GUI 的当前对话内全局搜索关键字，点结果跳转到对应位置。

覆盖：用户提问、AI 正文、**AI 推理内容**、工具调用与结果、注入的上下文。

## 安装

```
@2elian/dsh-client-ui-session-delta-search
```

在 dsh Web 的 **Plugins** 页面里安装，或 `dsh plugin --profile web add @2elian/dsh-client-ui-session-delta-search` 后到 Plugins 页面勾选。装完重启 `dsh web`。

完整安装说明、开发加载方式与排错见 [安装指南](../../docs/install.md)。

## 用法

点对话头部右侧的**放大镜**按钮打开面板，输入关键字，点结果跳转。`↑` `↓` 选择，`Enter` 跳转，`Esc` 关闭。

## 更多

功能特性、实现要点、已知限制见 [`docs/features/session-delta-search.md`](../../docs/features/session-delta-search.md)。

业务逻辑在 [`@2elian/dsh-session-delta-search`](../../packages/session/delta-search/README.md)，纯 TypeScript、零依赖；本包只负责挂到 DSH 的座位上。
