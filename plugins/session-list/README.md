# @2elian/dsh-client-ui-session-list

列出 DeepSeek Harness Web GUI 当前对话的全部提问，点击跳转到发送该消息的位置。

## 安装

```
@2elian/dsh-client-ui-session-list
```

在 dsh Web 的 **Plugins** 页面里安装，或 `dsh plugin --profile web add @2elian/dsh-client-ui-session-list` 后到 Plugins 页面勾选。装完重启 `dsh web`。

完整安装说明、开发加载方式与排错见 [安装指南](../../docs/install.md)。

## 用法

点对话头部右侧的**列表**按钮打开面板，浏览或筛选提问，点击跳转。`↑` `↓` 选择，`Enter` 跳转，`Esc` 关闭。

## 更多

功能特性、实现要点、与 DSH 自带轮次轨道的关系、已知限制见 [`docs/features/session-list.md`](../../docs/features/session-list.md)。
