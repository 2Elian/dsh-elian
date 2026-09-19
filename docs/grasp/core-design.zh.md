# GraSP 核心设计与 DSH 适配路线

[English](core-design.md) | 中文

## 摘要

GraSP 在技能检索与执行之间增加一个编译阶段，把少量候选技能实例化为带 `state`、`data`、`order` 三类依赖边的有向无环图（DAG），然后按依赖执行、逐节点验证，并在失败附近做有界修复。它解决的不是“DSH 缺少技能”，而是技能过多时选择、排序、验证和恢复仍由一次模型推理隐式承担的问题。

DSH 已有一个未接入运行时的 [`@deepseek-ai/dsh-skill-grasp`](../../packages/skill/grasp/README.zh.md) 原型。它实现了图类型、词法检索、确定性编译、拓扑执行、五类修复操作符和置信度路由的骨架，但还不能代表论文复现，也不能直接执行 DSH 的 Markdown skill。本设计建议保留纯算法核心，再增加 Cordis 运行时服务和模型工具消费方；首个可用版本通过 `ctx.skills` 检索指令，通过 `ctx.subagents` 执行节点，通过 Session 事件保存图状态和验证结果，不修改 `agent-loop`。

## 目录

- [动机](#motivation)
- [论文方法](#paper-method)
- [DSH 现状](#dsh-current-state)
- [目标架构](#target-architecture)
- [运行流程](#runtime-flow)
- [数据与接口](#data-and-interfaces)
- [故障处理](#failure-handling)
- [适配路线](#adaptation-roadmap)
- [验收与评测](#acceptance-and-evaluation)
- [风险与决策](#risks-and-decisions)
- [参考资料](#references)
- [Dev Note](#dev-note)

-----

<a id="motivation"></a>
## 动机

DSH 已能发现、加载和向模型展示大量技能，但当前技能目录主要回答“有哪些指令可用”。模型仍需在上下文中决定选哪些技能、如何组合、何时执行以及失败后重做多少工作。技能数量增长后，这种平面上下文会增加提示词负担，并丢失前置条件、数据流和资源顺序等因果信息。

GraSP 把问题拆成三个明确阶段：检索回答“可能需要哪些技能”，编译回答“这些技能如何形成最小可执行计划”，执行器回答“当前哪些节点可运行、结果是否可信、失败影响哪些后继节点”。这种分层与 DSH 的插件架构相容：算法核心不需要进入默认 agent loop，运行时适配可以通过现有 skill、subagent、tool 和 Session 能力完成。

预期收益是减少无关技能进入模型上下文、允许无依赖节点并行、保留已验证的执行结果，并把失败恢复限制在局部子图。论文在 ALFWorld、ScienceWorld、WebShop 和 InterCode 上报告了相对最强基线最高 19 分的奖励提升和最高 41% 的环境步骤下降；这些数字只说明方法潜力，不是本实现的验收承诺。

<a id="paper-method"></a>
## 论文方法

### 四阶段主链路

1. **记忆条件检索。** 语义检索分布与成功轨迹产生的记忆分布按权重融合，选出少量候选技能。检索置信度同时考虑记忆相似度、两种分布的一致性、第一与第二候选的分差和目标覆盖率。
2. **DAG 编译。** 模型提出技能调用和参数，编译器校验技能、参数与目标覆盖，再根据前置条件、效果、输入输出和历史顺序推断三类边。硬 `state`/`data` 边不能随意删除；软 `order` 边可以在消除环或修复时调整。
3. **验证执行与局部修复。** 执行器只调度依赖已满足的节点，在执行前检查前置条件，在执行后调用验证器。失败生成结构化事件，并在限定 hop、节点数、边数和尝试次数内应用修复操作符。
4. **置信度路由。** 低于低阈值时不信任技能图，直接回退到 ReAct；高于高阈值时按正常修复预算执行 DAG；中间区间使用更保守的修复策略。

### 图模型

一个节点是一次技能调用，而不是技能定义本身。节点至少包含技能标识、已绑定参数、前置条件、预期效果、验证器、状态、置信度和修复预算。图必须无环，所有节点必须从源节点可达并能到达汇节点，目标必须被覆盖，每个节点还必须存在有效参数和验证器。

`state` 边表示上游效果满足下游前置条件，`data` 边表示上游输出绑定下游输入，`order` 边表示经验顺序或资源冲突产生的软优先级。平面技能序列只是全部使用 `order` 边的特殊图。

### 五类局部修复

| 操作符 | 适用失败 | 必须保持的条件 |
| --- | --- | --- |
| `REBIND` | 技能正确但参数错误 | 新参数通过 schema 校验 |
| `INSERT_PREREQ` | 缺少前置状态 | 新子图能建立缺失条件 |
| `SUBSTITUTE` | 当前技能不可用或效果不足 | 替代技能保持下游所需接口与效果 |
| `REWIRE` | 依赖类型或顺序错误 | 只修改局部边且图仍为 DAG |
| `BYPASS` | 当前状态已满足下游需求 | 跳过节点不会破坏下游前置条件 |

局部修复失败后才允许进行一次受限的全局重编译，随后回退到 ReAct。已验证且不在受影响后继闭包中的节点必须保留。

-----

<a id="dsh-current-state"></a>
## DSH 现状

### 可直接复用的能力

| GraSP 需要 | DSH 现有能力 | 适配用途 |
| --- | --- | --- |
| 技能目录 | [`ctx.skills`](../../packages/skill/skill/src/index.ts) | 按当前 agent scope 和 cwd 获取稳定目录及技能正文 |
| 节点执行 | [`ctx.subagents`](../../packages/subagent/subagent/src/index.ts) | 为每个节点启动一次性子 agent，并支持结构化输出和取消 |
| 运行编排 | [`ctx.workflowEngine`](../../packages/workflow/workflow/src/index.ts) | 可作为对照或上层消费方，不承担 GraSP 图语义 |
| 工具与沙箱 | [`ctx.tools`](../../packages/core/tools/src/index.ts) | 子 agent 使用现有权限、工具执行与结果过滤链路 |
| 实时扩展 | `agent/*`、`tools/*` | 观察请求和工具执行，不修改核心 loop |
| 持久事实 | [`ctx.sessions`](../../packages/core/session/src/index.ts) | 保存图生命周期、节点结果、修复与终态供回放 |

### 已有 GraSP 原型

`packages/skill/grasp` 当前是无 Cordis 依赖的 TypeScript 库。它已提供 `retrieveSkills()`、`compileSkillGraph()`、`executeSkillGraph()`、`repairSkillGraph()`、`routeByConfidence()` 以及相应类型和基础单元测试。`docs/grasp` 中的[架构图](grasp-architecture.html)和[数据流图](grasp-dataflow.html)表达了同一拆分。

这个原型尚未被其他 package、bundle 或 profile 引用，因此启动任何现有 DSH profile 都不会启用 GraSP。它的 `SkillDefinition` 还是带 `execute()` 的可调用对象，而 DSH 的 `SkillDefinition` 是带 Markdown `content` 的指令定义；二者同名但语义不同，必须通过适配层转换，不能直接强制类型转换。

### 必须先修正的差距

| 区域 | 当前行为 | 进入运行时前需要补齐 |
| --- | --- | --- |
| 检索 | 英文 token overlap；目标覆盖率用效果数量近似 | 可注入语义检索；按真实目标事实计算覆盖；记录历史校准 |
| 编译 | 只自动推断精确字符串匹配的 `state` 边 | 校验技能存在、参数 schema、`data` 绑定、目标完整性和验证器 |
| 路由 | `reactive` 主要作为结果标签，图仍可能继续执行 | 在编译或执行前真正返回 fallback 决策 |
| 调度 | 拓扑顺序只计算一次 | 修复后重新计算 ready set，确保插入节点和失败节点被重新执行 |
| 修复预算 | `maxNodes`、`maxEdges` 未执行，尝试计数是全图共享 | 校验每个 patch 的节点/边变化并按节点计数 |
| 修复语义 | `REBIND` 只增加占位参数；`REWIRE` 可能删除节点但不重连 | 由失败类型和参数 schema 产生候选，并在提交前做完整图校验 |
| 持久化 | 事件只放在返回数组中 | 定义 Session 事件并在执行时追加，保证重启后可重建 |
| 并发 | 节点严格串行 | 按 ready set 并发，并对共享资源或工作区写入加 `order` 边 |

-----

<a id="target-architecture"></a>
## 目标架构

建议采用三个角色明确的 package，而不是把逻辑塞进 `agent-loop`：

| Package | 角色 | 主要职责 |
| --- | --- | --- |
| `packages/skill/grasp` | Service Definition + 纯类型/算法 | `GraspService`、图类型、校验、事件类型和不依赖 Cordis 的纯函数 |
| `packages/skill/grasp-basic` | Service Provider | 读取技能与记忆，调用 LLM 编译，调度 subagent，验证和修复图 |
| `packages/skill/tool-grasp` | Consumer | 注册模型可见的 `grasp` 工具，把父 agent、目标和取消信号交给服务，并把结果映射为工具结果 |

首个版本可以暂时让现有 `grasp` 包继续作为纯库，并在 `grasp-basic` 内声明私有适配服务；在接口稳定后再完成 Service Definition、Provider、Consumer 三角色拆分。默认 profile 不应立即启用 GraSP，先通过 overlay 做显式实验，避免改变所有任务的模型行为和 Session 格式。

### 为什么以工具作为入口

`grasp` 工具是最小侵入的接入点。模型或用户明确请求结构化技能编排时调用它；低置信度、编译失败或修复耗尽时，工具返回结构化原因，父 agent 继续现有 ReAct 循环。这样不需要拦截 `agent/pre-step` 或替换默认 driver，也不会让 GraSP 与普通工具调用争夺同一个轮次所有权。

### 为什么节点使用 subagent

DSH skill 是指令，不是函数。运行时适配器先用 `ctx.skills.get()` 取得节点选择的技能正文，再把“节点目标、绑定参数、允许产生的效果、验证输出 schema”与技能正文一起交给 `ctx.subagents.start()`。子 agent 继承 DSH 的工具、沙箱、权限和工作区语义，并返回结构化 `observations`、`outputs` 和 `claimedEffects`。宿主验证器只接受可观察证据，不把模型声明本身当成效果成立。

简单的纯工具型节点以后可以注册原生执行适配器，绕过 subagent；这属于性能优化，不是首版前提。

<a id="runtime-flow"></a>
## 运行流程

1. `tool-grasp` 接收目标和可选限制，捕获当前父 agent、cwd 与取消信号。
2. `grasp-basic` 从 `ctx.skills.snapshot({ cwd, scope: parent })` 获取完整稳定目录；目录不完整时拒绝本次编译，不使用半旧半新的候选集。
3. 检索器结合任务、当前可观察状态、技能摘要和成功轨迹投影，输出 top-M 候选、四项置信度特征与最终置信度。
4. 低置信度直接返回 `fallback`；其余请求加载候选技能正文，并要求 LLM 生成满足 JSON schema 的节点、参数、目标事实和边。
5. 确定性编译器校验技能标识、参数、边端点、环、源/汇可达性、目标覆盖和验证器注册。软边可以为消环而删除，硬边失败则拒绝编译。
6. 执行器计算 ready set。没有共享资源冲突的节点可以并发；存在工作区、终端或外部账户冲突的节点必须由 `order` 边串行化。
7. 每个节点执行前求值前置条件，执行后由注册验证器检查真实环境与结构化结果。通过后追加节点成功事件并冻结其输出。
8. 失败时选择局部修复操作符，校验 patch 预算和图不变量，只重置失败节点及其受影响后继。新图重新计算 ready set。
9. 局部修复耗尽后对剩余目标进行一次全局重编译；仍失败则返回父 agent，由现有 ReAct 路径接管。
10. 每次成功运行把可复用的技能序列、关键状态和结果写入记忆投影；失败轨迹可以用于诊断，但不能提高技能先验。

<a id="data-and-interfaces"></a>
## 数据与接口

### 节点运行协议

建议把现有 `Fact = string` 升级为带命名空间的谓词，避免不同 provider 碰巧使用相同字符串。首版至少区分 `workspace.*`、`tool.*`、`artifact.*`、`session.*` 和 provider 自有前缀。

```ts
interface GraspInvocation {
  id: string
  skillName: string
  args: Readonly<Record<string, unknown>>
  preconditions: readonly Predicate[]
  effects: readonly Predicate[]
  verifier: string
  confidence: number
  repairBudget: RepairBudget
}
```

`verifier` 引用注册表中的确定性或模型辅助验证器。确定性验证器优先；模型辅助验证必须返回结构化证据，并标记置信度，不能仅输出自然语言“已完成”。

### 持久事件

模型可见或影响恢复的事实必须写入 Session。建议的最小事件族是 `grasp/run-start`、`grasp/compiled`、`grasp/node-start`、`grasp/node-end`、`grasp/repair`、`grasp/replan` 和 `grasp/run-end`。事件存放不可变快照和稳定 ID，不保存活跃 `Agent`、函数、`Set` 或 `Map`。

Session projection 从事件重建运行状态：当前图版本、已验证节点、失效后继、修复次数、输出绑定和终态。中断恢复只能重新运行未验证或已失效节点；已验证且无副作用不确定性的节点不得重复执行。

### 记忆投影

记忆记录至少包括任务摘要、初始状态摘要、技能序列、边类型、成功结果、环境标识和检索特征。只有验证完成的成功运行进入正向先验。若没有可靠 embedding 服务，首版可以沿用确定性词法检索，但必须把它标为 baseline，并允许 provider 替换评分器。

<a id="failure-handling"></a>
## 故障处理

失败事件分为 `precondition`、`execution`、`postcondition` 和 `timeout`。取消不是可修复失败；收到 abort 后必须停止启动新节点、取消活跃子 agent，并以 cancelled 终态结束。权限拒绝默认也不应通过换技能绕过，除非策略明确允许替代方案。

修复 patch 提交前必须满足：图无环；新节点来自当前可见技能目录；参数通过 schema；所有受影响节点有验证器；未受影响的已验证祖先不变；节点和边变化不超过预算。共享外部副作用的节点还要声明幂等性或补偿策略，否则中断后只允许人工确认或 ReAct 接管。

<a id="adaptation-roadmap"></a>
## 适配路线

### 阶段 0：修正纯核心

- 把 reactive 路由改为执行前返回，不再运行图。
- 用动态 ready queue 替代一次性拓扑数组，修复后重新调度。
- 完整执行 `maxHops`、`maxNodes`、`maxEdges`、每节点 `maxAttempts` 和全局重编译预算。
- 为五类操作符添加成功与拒绝测试，尤其覆盖插入节点执行、硬边不可删除、替代效果兼容和 bypass 条件。
- 增加目标完整性、参数绑定、data 边和验证器存在性校验。

阶段 0 完成标准是纯核心可以在无 Cordis 环境下通过确定性状态机测试，并且故障注入不会重复执行未受影响节点。

### 阶段 1：只读 DSH 适配

- 新建 `grasp-basic`，读取 `ctx.skills.snapshot()` 和候选正文，但只生成、校验并返回 DAG，不执行节点。
- 使用结构化 LLM 输出产生 invocation 和 typed edges；保存编译诊断但不改变父 Session 的行为。
- 通过 overlay 暴露调试工具，例如 `grasp_compile`，用于比较平面技能选择与 DAG 结果。

这个阶段验证语义映射，风险最低，也能尽早发现 DSH Markdown skill 缺少前置条件、效果和参数声明的问题。

### 阶段 2：受限执行

- 增加 `tool-grasp` 和 subagent 节点执行器，仅允许显式白名单 skill。
- 首批谓词限制在可可靠验证的工作区文件、命令退出码、测试结果和结构化交付物。
- 写入完整 Session 事件，支持 UI/SDK 回放和中断诊断。
- 默认串行执行；只有没有资源冲突且测试证明隔离的节点才并行。

阶段 2 完成标准是一个本地 coding 场景能从检索、编译、执行、一次局部修复走到成功，并在 Session 回放中重建相同终态。

### 阶段 3：记忆与置信度校准

- 从成功 Session 建立轨迹 projection，接入 embedding 或可替换评分 provider。
- 用离线样本拟合或校准四项置信度；阈值作为 Cordis config，而不是源码常量。
- 对比 `ReAct`、`ReAct + flat skills`、`GraSP without repair` 和完整 GraSP。

### 阶段 4：产品化

- 增加 graph/repair UI、运行取消与节点证据查看。
- 根据评测决定是否加入某个 shipped bundle；在此之前保持 overlay opt-in。
- 稳定事件协议、Python/TypeScript SDK 投影和 Session 格式迁移，再考虑默认启用。

-----

<a id="acceptance-and-evaluation"></a>
## 验收与评测

单元测试覆盖图不变量、三类边、ready set、五类修复、预算、取消和确定性排序。集成测试挂载真实 `ctx.skills` 与 fake subagent provider，证明 scope/cwd 解析、结构化输出、验证失败和 Session 事件顺序。录制快照覆盖模型看到的工具 schema、工具结果和可回放 transcript。

首轮评测不以论文数字作为目标，而比较同一模型、同一工具、同一任务预算下的四条路径：普通 ReAct、加载平面 skills、GraSP 无修复、完整 GraSP。至少记录成功率、模型请求数、环境/工具步骤、输入输出 token、回退率、局部修复成功率和重复副作用次数。

建议先使用仓库已有的 coding 与 shell 场景，补充三类专门故障：缺少前置文件、参数绑定错误、某节点执行成功但后置验证失败。只有完整 GraSP 在成功率或步骤数上稳定优于 flat skills，才值得扩大默认使用范围。

<a id="risks-and-decisions"></a>
## 风险与决策

- **术语冲突：** 文档和类型中把论文节点称为 `GraspInvocation` 或 `ExecutableSkill`，避免与 DSH Markdown `SkillDefinition` 混用。
- **不可信效果：** 子 agent 的 `claimedEffects` 只是候选证据；宿主验证器决定效果是否成立。
- **共享工作区：** 并行分支可能发生文件冲突；编译器必须把资源冲突转成 `order` 边，不能只依赖图拓扑。
- **Session 兼容：** 新持久事件需要声明类型、生成目录、回放投影和双 SDK 更新；原型阶段不得先写临时 JSON 事件再补协议。
- **回退语义：** fallback 表示把剩余目标交回父 agent，不代表失败节点已经成功，也不能吞掉权限、取消或安全错误。
- **论文边界：** 论文主要在交互式基准中验证；DSH coding 任务的长时间副作用、多人协作和断点恢复需要独立评测。

<a id="references"></a>
## 参考资料

- [GraSP 论文](https://arxiv.org/abs/2604.17870)
- [现有 GraSP 核心包](../../packages/skill/grasp/README.zh.md)
- [DSH Skill 子系统](../subsystems/skills.zh.md)
- [DSH Subagent 子系统](../subsystems/subagent.zh.md)
- [DSH Workflow 子系统](../subsystems/workflow.zh.md)
- [Agent 轮次与步骤生命周期](../agent-lifecycle.zh.md)
- [现有架构图](grasp-architecture.html)
- [现有数据流图](grasp-dataflow.html)

-----

## Dev Note

本文是实现前设计基线，不声明 `grasp-basic`、`tool-grasp`、Session 事件或运行时适配已经存在。当前可执行代码仅限 `packages/skill/grasp` 中的未接入原型；“目标架构”和“适配路线”描述建议实现顺序。论文未提供与 DSH 的官方集成，本设计中的 package 划分、subagent 节点执行和 Session 协议均为基于当前仓库能力的工程推导。
