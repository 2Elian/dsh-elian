# 开发指南

## 目录结构

```
dsh-elian/
├── packages/
│   └── session/delta-search/        @2elian/dsh-session-delta-search
│       ├── src/                     纯函数：抽取、匹配、锚点、落点、轮次折叠
│       └── tests/                   vitest 单测
├── plugins/
│   ├── session-delta-search/        @2elian/dsh-client-ui-session-delta-search
│   └── session-list/                @2elian/dsh-client-ui-session-list
│       ├── index.js                 host 半（空 apply）
│       ├── client.js                构建产物，客户端 bundle
│       ├── src/client/              浏览器半：座位注册、组件、文案、样式
│       ├── cordis.patch.yml         bundle patch（持久安装用）
│       ├── dev.overlay.yml          本地开发 overlay
│       └── build.mjs                三行，调用 scripts/client-bundle.mjs
├── scripts/
│   ├── client-bundle.mjs            esbuild → __ModuleLoader__.load 格式
│   ├── validate-plugins.mjs         用 DSH 自己的 parseDshClient 校验清单
│   └── smoke-plugins.mjs            真实执行 bundle 工厂跑 apply()
└── docs/
```

## 分工约定

- **`packages/`**：算法与纯函数。不 import 任何 `@deepseek-ai/*`，不 import React，可以在 Node 下单测。
- **`plugins/`**：DSH 集成。一个插件负责声明 `dsh.client`、注册到座位、提供文案与样式、打包客户端 bundle。
- 多个插件复用同一段逻辑时，抽到 `packages/` 下，让插件按包名依赖它——它会被 esbuild 内联进各自的 bundle，运行时不需要装。

## 命令

```sh
pnpm install
pnpm run build       # 核心库 tsc + 两个插件的 client.js
pnpm run test        # 核心库单测
pnpm run typecheck   # 核心库 + 插件
pnpm run validate    # 清单契约校验
pnpm run smoke       # bundle 工厂 + apply() 冒烟
pnpm run check       # 以上全部
```

## 开发循环

`client.js` 是构建产物。仓库外的包不在 DSH `pnpm run dev:web` 的 watch 范围里（它只 glob `packages/*/*`），所以自己跑 watch：

```sh
cd plugins/session-delta-search && node build.mjs --watch
```

运行中的 `dsh web` 会轮询 `client.js` 的 mtime，产物一变就热替换客户端插件，不用重启服务。改了 host 半（`index.js`）则需要重启。

## 构建产物格式

DSH 的客户端 bundle 是一个注册到浏览器模块表的惰性 CommonJS 工厂：

```js
window.__ModuleLoader__.load({
  id: '<包名>',                      // 必须等于 package.json 的 name
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports;
    /* …打包后的 CJS… */
    return module.exports;
  },
});
```

仓库自带的 `clientBundle()` tsdown preset 只认仓库内的 `packages/*/*`（它的 `workspaceManifest()` 会在仓库根 glob），仓库外必须自己产出这个格式——DSH 官方 skill `cordis-plugin-development` 也是这么写的。[`scripts/client-bundle.mjs`](../scripts/client-bundle.mjs) 用 esbuild 做这件事：

- `format: cjs`，`platform: browser`；
- 把 `react` / `react/jsx-runtime` 和 `PLATFORM_MODULES` 里的一切声明为 external，其余全部内联；
- 加上 loader 包装的 banner/footer。

**只有模块表能答复的 specifier 才能留成 `require()`**，其他任何运行时 import 都会在工厂执行时抛错。`pnpm run validate` 会检查这一点。

## 验证分层

| 层 | 命令 | 能证明什么 | 不能证明什么 |
| --- | --- | --- | --- |
| 纯逻辑 | `pnpm run test` | 抽取正确（含推理）、查询语义、锚点推导、翻页落点 | 与宿主的集成 |
| 类型 | `pnpm run typecheck` | 内部一致 | 宿主接口没变 |
| 清单契约 | `pnpm run validate` | `dsh.client` 合法、bundle 存在、注册 id 正确、`require()` 都在模块表内、**host 半能被 import 且导出 `apply()`** | 能被扫描到 |
| 激活 | `pnpm run smoke` | bundle 工厂可执行、`apply()` 注册到正确座位、暴露正确 hooks、能干净卸载 | **用户看到什么** |

**最后一格必须靠一次真实的 `dsh web --patch ...` 目视确认**，自动化测试替代不了。

### 为什么 host 半也要 import 检查

`index.js` 是**纯 JavaScript**：Loader 直接 import 它。如果里面留下任何 TypeScript 语法（例如 `export function apply(): void {}`），Node 会抛 `SyntaxError`。而这个插件的行是可选条目，所以**启动不会失败**——只在终端打一行警告：

```
dsh: warning: 2 entries did not activate
session-delta-search (.../index.js): failed to import
```

客户端 entry 因此根本不进启动图，界面上什么都不会出现，浏览器里也没有任何报错。`pnpm run validate` 现在会 import 一次 host 半来堵住这个洞。排查同类问题时，最快的方式是看启动时的那行警告，或访问启动图确认条目在不在：

```js
// 浏览器 console
JSON.parse(document.querySelector('[data-dsh-boot]')?.textContent ?? 'null')  // 或直接看页面源码里的 __DSH_BOOT__
```

### 两个作用域陷阱

1. **`conversation` 是 session 作用域服务**，不是 root 服务。root 级插件不能把它写进 `inject`（解析不到会让 fiber 永久 pending，`apply` 不执行），要用 `ctx.sessions.scope(sessionId)?.get('conversation')` 在调用时取。它的报错原文就是线索：*"requires a session scope — address one via ctx.sessions.scope(id).conversation"*。
2. **launcher flag 必须排在 app flag 前面**。dsh 的 launcher 只解析自己认识的 token，遇到第一个不认识的（如 `--port`）就把后面全部交给 app，于是 `--patch` 变成 app 参数并报 `unknown option`。详见 [install.md](install.md)。


## 依赖的唯一来源

`packages/session/delta-search/src/surface.ts` 用结构化接口复述了插件读取的宿主表面（会话事件源、会话注册表、locale、slots）。每一段都注明对应的 DSH 源文件，便于上游改动时同步。仓库外无法 import 宿主的类型，这是不得不做的取舍。

## 遗留目录

`plugins/grasp/`、`docs/grasp/`、`verify.mjs` 属于已废弃的 GraSP 插件原型；它的核心包 `packages/skill/grasp` 已删除，`plugins/grasp` 因此被 [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) 排除（否则 `pnpm install` 会因 `workspace:^` 解析失败而报错）。确认不再需要后可直接删除这三处。
