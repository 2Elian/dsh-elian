# 发布指南

把代码 push 到 GitHub 只是托管源码；**要让别人用 `dsh plugin add <包名>` 安装，包必须在 npm 上**。下面是两条可行的分发路径。

## 路径一：发布到 npm（推荐）

### 前置

npm scope `@2elian` 需要一个 npm 账号或组织叫 `2elian`。如果你 npm 用户名不是 `2elian`，两条路：

- 去 npmjs.com 建一个叫 `2elian` 的组织；或
- 把包名 scope 换成你真实拥有的 scope（改三处 `package.json` 的 `name`，以及插件源码里 import 核心库的那几行，然后重建）。

### 步骤

```sh
# 1. 登录
npm login

# 2. 构建（prepublishOnly 也会再构建一次，但先构建能提前发现问题）
pnpm run build && pnpm run check

# 3. 先 dry-run 看清会发什么
pnpm --filter @2elian/dsh-session-delta-search publish --dry-run
pnpm --filter @2elian/dsh-client-ui-session-delta-search publish --dry-run

# 4. 发布
pnpm --filter @2elian/dsh-session-delta-search publish --access public
pnpm --filter @2elian/dsh-client-ui-session-delta-search publish --access public
pnpm --filter @2elian/dsh-client-ui-session-list publish --access public
```

发布顺序：**先核心库，再插件**。

### 关于版本与依赖

- `workspace:^` 在 `pnpm publish` 时会被改写成真实版本号。核心库改了并升了版本，插件要重新发布一次，否则用户装到的插件仍然指向旧核心库（运行时其实不影响——核心库在构建时已被内联进 `client.js`——但保持版本一致更清楚）。
- 插件把核心库放在 `devDependencies`，所以使用者装插件时**不会**额外拉核心库。这是有意的：核心库只参与构建。

### 发布内容

每个插件的 `files` 白名单只包含 `index.js`、`client.js`、`cordis.patch.yml`、`README.md`。`prepublishOnly` 会重新产出 `client.js`，所以即使本地没构建也能发出完整包。

### 发布后别人怎么装

见 [安装指南](install.md) 的方式一。

## 路径二：GitHub Release tarball（不发 npm）

`pnpm pack` 产出的 tarball 根目录就是插件包本身，可以挂到 GitHub Release 上：

```sh
pnpm run build
cd plugins/session-delta-search && pnpm pack      # → 2elian-dsh-client-ui-session-delta-search-0.1.0.tgz
cd ../session-list && pnpm pack
```

把生成的 `.tgz` 传到一个 Release，使用者：

```sh
dsh plugin --profile web add https://github.com/2Elian/dsh-elian/releases/download/v0.1.0/2elian-dsh-client-ui-session-delta-search-0.1.0.tgz
```

然后到 Plugins 页面勾选这个 bundle。

## 为什么不能直接 `dsh plugin add github:2Elian/dsh-elian`

`dsh plugin` 是把参数转发给 profile 目录里的 pnpm。pnpm 的 git 依赖装的是**仓库根**（根目录的 `package.json`），而本仓库是 monorepo，插件在 `plugins/<名字>/` 子目录里，pnpm 不支持从 git 仓库里指定子目录安装。所以 `github:2Elian/dsh-elian` 会拿到一个没有 `dsh.bundle.patch` 的普通仓库，装不成插件。

仓库根如果本身就是插件（`package.json` 在根、带 `dsh.bundle.patch`），那条路才通。本仓库为了放多个插件选择了 monorepo 结构，因此分发走 npm 或 tarball。

> DSH 确实支持 git 托管的插件，但要求包根就是插件；而且 pnpm 会挡住 git 依赖的 `prepare` 构建脚本，需要在 profile 的 `pnpm-workspace.yaml` 里按提示加 `allowBuilds`。这也是我们优先 npm 的原因之一。

## 给使用者的最短说明

如果只是想把这两个插件贴给别人用，把下面这段给他们就够了：

```
在 dsh Web 的 Plugins 页面里安装：
  @2elian/dsh-client-ui-session-delta-search
  @2elian/dsh-client-ui-session-list
装完重启 dsh web。
```
