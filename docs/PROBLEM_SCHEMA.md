# ts-learn 题目契约（Problem Contract）

这份文档是「题目作者」和「判题运行时」之间唯一的契约。任何一道题只要满足本文档，就会被
`src/problems/index.js` 自动收录、被 `src/runner.js` 正确执行、被 `scripts/verify-ts-learn-problems.mjs`
自动验证。

> 阅读顺序：先看 §1 的完整示例，再看 §2 的字段表，最后看 §3 的硬性规则。

---

## 1. 一道完整的题目

每个题目文件导出一个名为 `problems` 的数组，元素是本文件负责的题目：

```js
// plugins/ts-learn/src/problems/tool-execution.js

/** 工具执行方向的题目。 */
export const problems = [{
  // ↓ 下面这个对象就是一道完整的题
  id: 'retry-backoff-planner',            // 全局唯一，kebab-case
  title: '工具调用重试计划器',
  difficulty: 'medium',
  theme: 'tool-execution',                // 见 §2.3
  algorithms: ['贪心', '模拟', '优先队列'],  // LeetCode 算法考点，1~3 个
  story:
    'Agent 调用外部工具时会遇到超时和限流。为了不把失败一次性砸给模型，'
    + '你需要为一批失败的工具调用安排重试时刻表。',
  task:
    '实现 planRetries：给定每个工具调用的首次失败时刻和它的退避间隔，'
    + '按「同一时刻最多放行 limit 次重试」的约束，返回每次重试被放行的时刻。',
  entry: 'planRetries',
  signature: 'export function planRetries(failures: number[], backoff: number, limit: number): number[]',
  starter: [
    '// 思路提示：把「候选时刻」按从小到大排序，再用一个循环依次放行。',
    '// 1) 为每个失败时刻算出它的第一次重试时刻 = 失败时刻 + backoff',
    '// 2) 用一个 Map<number, number> 记录每个时刻已经放行了多少次',
    '// 3) 放行后把该调用的下一次重试时刻也放进候选池',
    'export function planRetries(failures: number[], backoff: number, limit: number): number[] {',
    '  // TODO: 在这里写你的实现',
    '  return []',
    '}',
  ].join('\n'),
  solution: [ /* 参考实现，字符串数组 join('\n') 或直接模板字符串 */ ].join('\n'),
  tests: [
    { name: '示例 1', args: [[1], 2, 1], expected: [3, 5, 7], public: true },
    { name: '示例 2', args: [[1, 2], 3, 1], expected: [4, 5, 6], public: true },
    { name: '空输入', args: [[], 2, 1], expected: [] },
    { name: '容量充足', args: [[5, 5, 5], 1, 3], expected: [6, 6, 6] },
  ],
  examples: [
    { input: 'failures = [1], backoff = 2, limit = 1', output: '[3, 5, 7]', explain: '……' },
  ],
  constraints: ['1 <= failures.length <= 200', '0 <= backoff <= 100', '1 <= limit <= 20'],
  hints: [
    '先别想整体最优。把每个失败时刻的「第一次重试时刻」算出来，放进一个数组，然后问自己：这些候选时刻里，最先被放行的应该是哪一个？',
    '同一时刻最多放行 limit 次。如果某个时刻已经排满了，这一次重试就要往后挪 —— 但挪到哪里？挪到这个调用自己的下一个重试时刻，还是挪到该时刻的下一格？先想清楚这一点再写代码。',
    '用一个「当前时刻 t」从左到右扫描：先把所有 <= t 的候选重试收集起来，按容量放行 limit 次，放行掉的产生新的候选（时刻 = 放行时刻 + backoff）。剩下的留到 t 增加时继续。用 Map<number, number> 记每个时刻的排队长度。',
  ],
  knowledge: [
    'TypeScript：给函数参数标注 number[] 与 number 的区别',
    '算法：贪心 + 模拟（LeetCode 风格的「按时间扫描」）',
    'Agent：为什么工具重试要用退避而不是立即重试',
  ],
}]
```

---

## 2. 字段说明

### 2.1 身份与分类

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | `string` | 是 | 全局唯一，kebab-case，`[a-z0-9-]+` |
| `title` | `string` | 是 | 中文短标题，≤ 20 字，不带书名号 |
| `difficulty` | `'easy' \| 'medium' \| 'hard'` | 是 | 本插件只收 `medium`（少量 `easy` 作为热身也允许） |
| `theme` | `string` | 是 | agent 开发主题，见 §2.3 |
| `algorithms` | `string[]` | 是 | 1~3 个 LeetCode 算法考点，中文 |
| `knowledge` | `string[]` | 是 | 2~4 条知识点，每条以 `类型：` 开头，例如 `TypeScript：…`、`算法：…`、`Agent：…` |

### 2.2 题面（面向新手）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `story` | `string` | 是 | 60~200 字的 agent 开发场景，解释「为什么需要这个函数」 |
| `task` | `string` | 是 | 80~300 字，明确写出输入、输出、边界要求。假设读者没写过 agent |
| `entry` | `string` | 是 | 必须导出的函数名，须与 `signature`、`starter`、`solution` 一致 |
| `signature` | `string` | 是 | 一行 TypeScript 签名，用于题面展示 |
| `starter` | `string` | 是 | 起始代码。**必须**包含函数骨架和 2~4 行「思路提示」注释，最后一行是 `}` |
| `solution` | `string` | 是 | 参考实现。**不下发给浏览器**，只用于自检与题目质量验证 |
| `examples` | `Example[]` | 是 | 2~3 个，用于题面展示 |
| `constraints` | `string[]` | 是 | 2~5 条约束，说明数据规模 |

### 2.3 `theme` 取值

必须严格取以下之一（它们是题目的 agent 开发方向）：

| 值 | 中文 |
|---|---|
| `agent-loop` | Agent 循环 |
| `llm-provider` | LLM 调用与 Provider 适配 |
| `tool-execution` | 工具执行 |
| `context-injection` | 上下文注入 |
| `system-prompt` | System Prompt 设计与注入 |
| `skill` | Skill 相关 |
| `gateway` | Gateway 相关 |
| `event-stream` | 事件流相关 |
| `subagent` | 子代理相关 |

### 2.4 测试用例

```ts
interface TestCase {
  name: string          // 中文用例名，例如 '示例 1'、'全部相同'、'边界：空数组'
  args: unknown[]       // 传给 entry 的位置参数，必须是「无损 JSON」值
  expected: unknown     // 期望返回值
  public?: boolean      // true = 自测可见（展示期望值）；省略/false = 隐藏用例
  compare?: 'deep' | 'unordered' | 'set'   // 默认 'deep'，见下
}
```

- `compare: 'deep'`（默认）：结构完全相等，数组有序、对象键集合与取值相等。
- `compare: 'unordered'`：数组按「多重集」比较，忽略元素顺序；对象仍按 deep 比较。
- `compare: 'set'`：数组按「集合」比较，忽略顺序与重复。

其他规则：

1. **至少有 3 个 `public: true`** 的用例（新手要能靠自测把主流程跑通）。
2. **至少有 4 个隐藏用例**（`public` 省略或 `false`），用来覆盖边界与规模。
3. 用例总数 7~12 个。
4. `args` 与 `expected` 中**禁止**出现 `undefined`、`NaN`、`Infinity`、`Date`、`Map`、`Set`、
   `BigInt`、函数、循环引用。只用 `null | boolean | number | string | array | 纯对象`。
5. **禁止浮点数期望值**（`0.1 + 0.2` 这类比较会让新手困惑）。需要表示比例时用整数。
6. 期望值必须是**唯一的**：不存在「两种都算对」的情况。做不到就改题面，把判定规则写死。

### 2.5 提示（新手体验的核心）

`hints` 是**从浅到深的三层提示**，长度 3（也可以 2~4，但别超过 4）：

| 层 | 该说什么 | 不该说什么 |
|---|---|---|
| 1 | 复述关键约束，指向应该先想清楚的那一个问题 | 不提具体数据结构 |
| 2 | 点出正确思路的关键一步（用提问句） | 不给伪代码、不给完整算法名 |
| 3 | 给出数据结构 + 步骤骨架（可以接近伪代码） | **仍然不写完整可运行代码** |

提示 3 之后用户可以自己选择「看参考实现」，所以提示里不要直接把答案贴出来。

---

## 3. 硬性规则（`scripts/verify-ts-learn-problems.mjs` 会逐条检查）

**契约校验（`validateProblem`，纯静态）**

1. `id` 全局唯一且是 kebab-case；`title` 全局唯一。
2. `title` 2~24 字，`story` 60~200 字，`task` 80~300 字（按 Unicode 字符数计）。
3. `knowledge` 每条必须以「类型：内容」开头，例如 `TypeScript：…`、`算法：…`、`Agent：…`。
4. `starter` 必须含 `export` 与 `TODO`；`solution` 必须含 `export`。
5. `signature` 的形参个数必须与**每个**用例的 `args.length` 一致（`signatureArity` 会正确处理泛型、
   嵌套函数类型和对象类型里的逗号）。
6. 所有字符串字段非空、无 `\t`、无行尾空格。
7. `tests` 的 `args`/`expected` 只能是 JSON 纯值：禁止 `undefined`、`NaN`、`Infinity`、`Date`、
   `Map`、`Set`、`BigInt`、函数、循环引用。

**行为校验（真实子进程执行，`scripts/check-ts-learn-bank.mjs`）**

8. `solution` 在 `public` + 隐藏的全部用例上**必须全部通过**，并且跑完全部用例（`completed === true`）。
9. `starter` **必须**至少失败 1 个用例（否则这道题没难度）。

---

## 4. 写题时的几条经验

- **算法是主菜，agent 是包装。** 题面讲 agent 场景，但用户真正练的是 LeetCode 中等难度的算法。
- **单一文件、纯函数。** 不要文件 IO、不要网络、不要 `process`、不要 `import` 其他模块。
  除 `src/problems/*.js` 里定义题目外，题目代码本身只用标准库里的 `Map` / `Set` / `Array` / `Math`。
- **别出「猜 API」的题。** 题面要把函数签名和返回值的形状写清楚，新手不应该卡在「我该返回什么」。
- **期望值要能一眼看懂。** 例如返回 `number[]` 就别返回 `Map`。
- **一次只教一个算法。** 贪心 + 堆这种组合可以，但不要再叠滑动窗口。
