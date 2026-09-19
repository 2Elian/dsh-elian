# @deepseek-ai/dsh-skill-grasp

`@deepseek-ai/dsh-skill-grasp` 是一个无运行时依赖的 TypeScript 核心包，用于实现 GraSP 论文中的技能编排链路：记忆条件检索、带类型边的 DAG 编译、节点验证、局部修复和基于置信度的路由。

该包刻意不绑定 Cordis、Agent Loop、LLM 或某一种沙箱。DSH 适配层负责提供技能定义、LLM 编译提案、会话事件和实际工具执行器，因此后续可以接入现有 DSH 运行时而不改动算法核心。

## 论文阶段与接口对应

| 论文阶段 | 本包接口 | DSH 接入位置 |
| --- | --- | --- |
| 记忆条件检索 | `retrieveSkills()` | `dsh-skill` 技能目录、会话/轨迹投影 |
| DAG 编译 | `compileSkillGraph()` | `dsh-llm` 结构化提案或确定性回退 |
| 前置/后置验证 | `SkillDefinition.verify`、`executeSkillGraph()` | 工具执行器与沙箱状态观察器 |
| 局部修复 | `repairSkillGraph()` | 技能注册表、参数绑定和会话事件日志 |
| 置信度路由 | `routeByConfidence()` | agent-loop 轮次路由与 ReAct 回退 |

默认实现是可测试的工程基线，不宣称复现论文的 LLM、嵌入模型或 benchmark 数字。生产接入时应把检索、编译提案、状态观察和事件持久化替换成 DSH 的实现。

## 当前边界

- 图变更会检查 DAG、源节点可达性和汇节点可达性。
- 局部修复由调用方提供 hop、节点、边和尝试次数上限。
- 执行过程输出类型化事件，便于 DSH 持久化生命周期和调试轨迹。
- 本包不直接执行 shell、启动进程或创建沙箱，只编排调用方提供的技能执行器。

## Known Limitations and Deferred Work

- 默认检索器是 token overlap；生产环境应注入 embedding 或模型分数。
- 确定性编译器按精确事实名推断 state 边；模型适配器应补充参数绑定和 data 边。
- 执行器当前使用调用方持有的状态集合和数据映射；后续可将 DSH 沙箱观测投影到这里。
