# Grasp生命周期

```

   #      位置                什么时候停                                 看什么
  ━━━━━  ━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1      scratch-plugin/     启动时（仅一次）                           插件确实被装载、ctx.tools.register 被调用
          grasp/
          index.ts:70
          apply()
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   2      scratch-plugin/     模型每次调 grasp                           args.action/scenario、
          grasp/                                                         exec.agent?.session.header.cwd、exec.signal
          index.ts:106
          execute
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   3      scratch-plugin/     调用前                                     catalog.skills 有几个、experience 内容
          grasp/
          index.ts:110
          retrieveSkills(.
          ..)
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   4      packages/skill/     进入检索                                   scores/memoryPrior，返回值里的
          grasp/src/                                                     features（memorySimilarity /
          retrieval.ts:7                                                 distributionAgreement / topSkillMargin /
                                                                         goalCoverage）
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   5      packages/skill/     路由判定                                   默认阈值 0.3/0.7 与结果 route
          grasp/src/
          router.ts:4
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   6      scratch-plugin/     图编译                                     candidates（= retrieval.selected）
          grasp/
          index.ts:127 →
          packages/skill/
          grasp/src/
          compiler.ts:5
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   7      packages/skill/     兜底提议 / 推 state 边 / 连 source-sink    边是怎么按 fact 字符串匹配出来的
          grasp/src/
          compiler.ts:12 /
          packages/skill/
          grasp/src/
          compiler.ts:35 /
          packages/skill/
          grasp/src/
          compiler.ts:82
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   8      packages/skill/     每次建图                                   validateSkillGraph 是非法图抛错的地方；
          grasp/src/                                                     topologicalOrder 决定执行顺序
          graph.ts:17 与
          packages/skill/
          grasp/src/
          graph.ts:39
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   9      scratch-plugin/     进执行器                                   context.state（此时是空 Set）
          grasp/
          index.ts:134 →
          packages/skill/
          grasp/src/
          executor.ts:7
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   10     packages/skill/     每个节点循环                               注意 order 是只算一次的：这正是上次说的"修复后
          grasp/src/                                                     不重试"缺陷所在
          executor.ts:25
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   11     packages/skill/     前置条件检查 / 触发 repair                 missing、repaired.repaired、repaired.operator
          grasp/src/
          executor.ts:31 /
           :33 (packages/
          skill/grasp/src/
          executor.ts:33)
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   12     packages/skill/     每个真实 skill 执行                        context.data 里 workspace.files /
          grasp/src/                                                     workspace.package / workspace.dependencies /
          executor.ts:41 →                                               report.body 逐步长出来
          scratch-plugin/
          grasp/
          catalog.ts:124/:
          134 (scratch-
          plugin/grasp/
          catalog.ts:134)/
          :141 (scratch-
          plugin/grasp/
          catalog.ts:141)/
          :149 (scratch-
          plugin/grasp/
          catalog.ts:149)
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   13     packages/skill/     后置校验                                   happy 场景 verify 返回 ok；verify-failure 场景
          grasp/src/                                                     在这里返回 ok:false
          executor.ts:45 +
          scratch-plugin/
          grasp/
          catalog.ts:169
  ─────  ──────────────────  ─────────────────────────────────────────  ────────────────────────────────────────────────
   14     packages/skill/     只有失败场景才停                           五个算子
          grasp/src/                                                     REBIND→INSERT_PREREQ→SUBSTITUTE→REWIRE→BYPASS
          repair.ts:5                                                    依次尝试，谁返回 undefined


```