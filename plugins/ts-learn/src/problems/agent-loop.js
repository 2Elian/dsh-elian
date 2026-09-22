/**
 * Agent 循环方向的题库：预算裁剪窗口、超时容忍步段、并行工具调用排轮。
 *
 * 每道题都是纯函数，agent 场景只作为包装，算法部分是 LeetCode 中等难度的
 * 滑动窗口与贪心配对。契约见 docs/PROBLEM_SCHEMA.md。
 *
 * @module problems/agent-loop
 */

/** @type {import('../problem-schema.js').Problem[]} */
export const problems = [{
  id: 'agent-shortest-budget-window',
  title: '步数预算裁剪窗口',
  difficulty: 'medium',
  theme: 'agent-loop',
  algorithms: ['滑动窗口', '双指针', '前缀和'],
  story:
    'Agent 在循环里一步步调用模型和工具，每一步都会烧掉一些预算。'
    + '想知道哪一段连续步骤最费预算，就要找出累计消耗最早达到警戒线的最短区间，'
    + '这样才能定位到最短、也最容易裁剪的那段循环。',
  task:
    '实现 shortestBudgetWindow：给定每一步的消耗 stepCosts（都是正整数）和警戒线 budget，'
    + '找出总消耗大于等于 budget 的最短连续区间。如果有多个区间的长度相同，'
    + '返回起始下标最小的那个。返回 [起始下标, 长度]，下标从 0 开始；'
    + '找不到这样的区间时返回 [-1, 0]。',
  entry: 'shortestBudgetWindow',
  signature: 'export function shortestBudgetWindow(stepCosts: number[], budget: number): number[]',
  starter: [
    '// 思路提示：返回 [起始下标, 长度]，找不到就返回 [-1, 0]。',
    '// 1) 区间必须连续，而且每一步的消耗都是正数，想想这个条件带来了什么便利。',
    '// 2) 用一个会伸缩的窗口：右端一直往右走，总和够 budget 时再收缩左端。',
    '// 3) 收缩的过程中记录最短的长度和它的起始下标，循环结束后返回这两个数。',
    'export function shortestBudgetWindow(stepCosts: number[], budget: number): number[] {',
    '  // TODO: 在这里写你的实现',
    '  return []',
    '}',
  ].join('\n'),
  solution: [
    'export function shortestBudgetWindow(stepCosts: number[], budget: number): number[] {',
    '  let left = 0',
    '  let sum = 0',
    '  let bestStart = -1',
    '  let bestLen = 0',
    '  for (let right = 0; right < stepCosts.length; right += 1) {',
    '    sum += stepCosts[right]',
    '    while (sum >= budget) {',
    '      const len = right - left + 1',
    '      if (bestStart === -1 || len < bestLen) {',
    '        bestStart = left',
    '        bestLen = len',
    '      }',
    '      sum -= stepCosts[left]',
    '      left += 1',
    '    }',
    '  }',
    '  if (bestStart === -1) return [-1, 0]',
    '  return [bestStart, bestLen]',
    '}',
  ].join('\n'),
  tests: [
    { name: '示例 1：刚好达到警戒线', args: [[1, 2, 3, 4, 5], 9], expected: [3, 2], public: true },
    { name: '示例 2：中间那段最短', args: [[2, 3, 1, 2, 4, 3], 7], expected: [4, 2], public: true },
    { name: '边界：空数组', args: [[], 5], expected: [-1, 0], public: true },
    { name: '单步就达到警戒线', args: [[5], 5], expected: [0, 1] },
    { name: '长度相同时取起点更小的', args: [[3, 3, 3, 3], 6], expected: [0, 2] },
    { name: '需要连续三步才够', args: [[2, 2, 2, 2], 5], expected: [0, 3] },
    { name: '只有最后一步够', args: [[1, 1, 1, 1, 9], 9], expected: [4, 1] },
    { name: '长数组里被一步撑满', args: [[1, 1, 1, 1, 1, 10, 1, 1, 1, 1], 10], expected: [5, 1] },
    { name: '全部相加也不够', args: [[1, 2, 3], 7], expected: [-1, 0] },
  ],
  examples: [
    {
      input: 'stepCosts = [1, 2, 3, 4, 5], budget = 9',
      output: '[3, 2]',
      explain: '下标 3 到 4 这两步的消耗是 4 和 5，累计正好 9，长度 2 是所有达标区间里最短的。',
    },
    {
      input: 'stepCosts = [2, 3, 1, 2, 4, 3], budget = 7',
      output: '[4, 2]',
      explain: '下标 0 到 3 这四步的总和是 8，长度 4；最短的是下标 4 到 5 的两步，总和 7，所以返回 [4, 2]。',
    },
    {
      input: 'stepCosts = [1, 1, 1], budget = 10',
      output: '[-1, 0]',
      explain: '全部步骤加起来只有 3，永远达不到 10，所以返回 [-1, 0]。',
    },
  ],
  constraints: [
    '1 <= stepCosts.length <= 100000',
    '1 <= stepCosts[i] <= 10000',
    '1 <= budget <= 10000000',
    'stepCosts 中每个元素都是正整数',
  ],
  hints: [
    '先确认两件事：区间必须连续，而且每一步的消耗都是正数。要回答的问题是 —— 返回的是最短的达标区间，那「最短」这个事实该在什么时候被记下来？',
    '固定右端不动，把左端往右推，区间总和只会变小。那么对每一个右端来说，能让总和刚刚还够 budget 的最靠右的左端在哪里？顺着这个方向，能不能让左右两端都不回头地各自走一遍数组？',
    '用一个会伸缩的窗口：右端从 0 扫到末尾，每一步都把 stepCosts[right] 累加进总和；只要总和大于等于 budget，就先用 right - left + 1 算出当前长度，并与已知最短长度比较，再把 stepCosts[left] 从总和里减掉、让 left 加一。只有长度严格变小时才更新答案，这样长度相同时留下的就是起点更小的那个。',
  ],
  knowledge: [
    'TypeScript：number[] 作参数和返回值时的类型标注写法',
    '算法：滑动窗口在「全正数 + 求最短区间」上的正确性依据',
    'Agent：为什么要给 agent 循环里的连续步段设一条预算警戒线',
  ],
}, {
  id: 'agent-timeout-tolerance-span',
  title: '超时容忍的连续步段',
  difficulty: 'medium',
  theme: 'agent-loop',
  algorithms: ['滑动窗口', '数组遍历'],
  story:
    'Agent 偶尔一步超时不算故障，连续多步都超时才是需要熔断的信号。'
    + '为了让熔断阈值既不敏感也不迟钝，先要量出：在最多容忍 tolerance 次超时的前提下，'
    + 'agent 最长能连续跑多长的一段步骤。',
  task:
    '实现 longestTolerableSpan：给定每一步是否超时的数组 stepTimeouts（1 表示超时，0 表示正常）'
    + '和容忍次数 tolerance，找出最长的连续区间，使区间内 1 的个数不超过 tolerance。'
    + '返回 [起始下标, 长度]，下标从 0 开始；长度相同时返回起始下标最小的那个；'
    + '长度只能是 0 时返回 [0, 0]。',
  entry: 'longestTolerableSpan',
  signature: 'export function longestTolerableSpan(stepTimeouts: number[], tolerance: number): number[]',
  starter: [
    '// 思路提示：返回 [起始下标, 长度]，下标从 0 开始。',
    '// 1) 区间里允许出现超时，只是超时步数不能超过 tolerance。',
    '// 2) 右端一直往右扩展，数一数窗口里已经有多少次超时。',
    '// 3) 超时次数超标时挪左端，并记录最长的长度和它的起点。',
    'export function longestTolerableSpan(stepTimeouts: number[], tolerance: number): number[] {',
    '  // TODO: 在这里写你的实现',
    '  return []',
    '}',
  ].join('\n'),
  solution: [
    'export function longestTolerableSpan(stepTimeouts: number[], tolerance: number): number[] {',
    '  let left = 0',
    '  let timeouts = 0',
    '  let bestStart = 0',
    '  let bestLen = 0',
    '  for (let right = 0; right < stepTimeouts.length; right += 1) {',
    '    if (stepTimeouts[right] === 1) timeouts += 1',
    '    while (timeouts > tolerance) {',
    '      if (stepTimeouts[left] === 1) timeouts -= 1',
    '      left += 1',
    '    }',
    '    const len = right - left + 1',
    '    if (len > bestLen) {',
    '      bestLen = len',
    '      bestStart = left',
    '    }',
    '  }',
    '  return [bestStart, bestLen]',
    '}',
  ].join('\n'),
  tests: [
    { name: '示例 1：容忍一次超时', args: [[1, 1, 0, 1], 1], expected: [1, 2], public: true },
    { name: '示例 2：从头开始最长', args: [[1, 0, 0, 1, 1, 0], 1], expected: [0, 3], public: true },
    { name: '边界：全都是正常步', args: [[0, 0, 0, 0], 0], expected: [0, 4], public: true },
    { name: '不容忍且全程超时', args: [[1, 1, 1], 0], expected: [0, 0] },
    { name: '容忍次数覆盖全部', args: [[1, 1, 1, 1], 4], expected: [0, 4] },
    { name: '边界：空数组', args: [[], 2], expected: [0, 0] },
    { name: '只有一个正常步', args: [[0], 0], expected: [0, 1] },
    { name: '容忍刚好用满', args: [[1, 0, 1, 0, 1], 2], expected: [0, 4] },
    { name: '最长区间在尾部', args: [[1, 1, 0, 0, 0], 1], expected: [1, 4] },
  ],
  examples: [
    {
      input: 'stepTimeouts = [1, 1, 0, 1], tolerance = 1',
      output: '[1, 2]',
      explain: '任何长度为 3 的区间都至少含 2 次超时，所以最长只能到长度 2。符合条件的区间有两个，取起点更小的那个，返回 [1, 2]。',
    },
    {
      input: 'stepTimeouts = [1, 0, 0, 1, 1, 0], tolerance = 1',
      output: '[0, 3]',
      explain: '下标 0 到 2 的三步是 [1, 0, 0]，只含 1 次超时，长度 3 已经是最长，而且它起点最小。',
    },
    {
      input: 'stepTimeouts = [1, 1, 1], tolerance = 0',
      output: '[0, 0]',
      explain: '一次超时都不允许，而每一步都在超时，所以合法的区间长度只能是 0。',
    },
  ],
  constraints: [
    '0 <= stepTimeouts.length <= 100000',
    'stepTimeouts[i] 只能是 0 或 1',
    '0 <= tolerance <= 100000',
  ],
  hints: [
    '先复述判定规则：区间里可以出现超时，但超时步数不能超过 tolerance。要回答的问题是 —— 当右端继续往右扩展时，左端凭什么决定要不要往右挪？',
    '如果窗口里的超时次数已经超标，只有把左端往右挪才可能重新合法。那挪完之后，窗口是应该尽量保持长，还是可以随便缩？想清楚这一点，就知道左端是「只在超标时挪」还是「一直跟着右端走」。',
    '用一个宽度只增不减的窗口：维护 left 和窗口内的超时次数 timeouts。右端每走一步就把新的超时计入 timeouts；只要 timeouts 超过 tolerance，就一边把 stepTimeouts[left] 移出窗口一边让 left 加一。随后算长度 right - left + 1，只有严格大于已知最长长度时才把 left 记成起点。',
  ],
  knowledge: [
    'TypeScript：用 0/1 表示状态时，参数类型为什么仍然写成 number[]',
    '算法：滑动窗口里「窗口只增不减」的写法为什么能得到最长区间',
    'Agent：熔断器为什么用连续超时步数而不是单步耗时来判定',
  ],
}, {
  id: 'agent-min-parallel-rounds',
  title: '并行工具调用的最少轮数',
  difficulty: 'medium',
  theme: 'agent-loop',
  algorithms: ['排序', '贪心', '双指针'],
  story:
    'Agent 一轮里可以并行发起最多两个工具调用，但同一轮里两个调用的成本加起来不能超过本轮预算。'
    + '为了估算这个子任务还要跑几轮，需要算出把所有工具调用排完所需的最少轮数，'
    + '遇到排不下的调用时要如实报告。',
  task:
    '实现 minParallelRounds：给定每个工具调用的成本 toolCosts 和每轮预算 roundBudget。'
    + '每轮最多安排两个调用，并且这一轮两个调用的成本之和不能超过 roundBudget，'
    + '所有调用都必须被安排。返回所需的最少轮数；如果某个调用自己的成本就超过 roundBudget，'
    + '返回 -1；toolCosts 为空时返回 0。',
  entry: 'minParallelRounds',
  signature: 'export function minParallelRounds(toolCosts: number[], roundBudget: number): number',
  starter: [
    '// 思路提示：每轮最多两个调用，两个的成本之和不能超过 roundBudget。',
    '// 1) 先想最贵的那个调用：它最好和谁排在同一轮？',
    '// 2) 如果连最便宜的调用都配不上它，它就只能独占一轮。',
    '// 3) 把成本从小到大排序后，用左右两个指针从两端向中间配对。',
    'export function minParallelRounds(toolCosts: number[], roundBudget: number): number {',
    '  // TODO: 在这里写你的实现',
    '  return 0',
    '}',
  ].join('\n'),
  solution: [
    'export function minParallelRounds(toolCosts: number[], roundBudget: number): number {',
    '  const sorted = [...toolCosts].sort((a, b) => a - b)',
    '  for (const cost of sorted) {',
    '    if (cost > roundBudget) return -1',
    '  }',
    '  let left = 0',
    '  let right = sorted.length - 1',
    '  let rounds = 0',
    '  while (left <= right) {',
    '    if (left === right) {',
    '      rounds += 1',
    '      break',
    '    }',
    '    if (sorted[left] + sorted[right] <= roundBudget) {',
    '      left += 1',
    '    }',
    '    right -= 1',
    '    rounds += 1',
    '  }',
    '  return rounds',
    '}',
  ].join('\n'),
  tests: [
    { name: '示例 1：三个调用分两轮', args: [[1, 2, 3], 3], expected: 2, public: true },
    { name: '示例 2：每个都只能独占一轮', args: [[3, 5, 3, 4], 5], expected: 4, public: true },
    { name: '边界：没有工具调用', args: [[], 5], expected: 0, public: true },
    { name: '单个调用就超预算', args: [[1, 9], 5], expected: -1 },
    { name: '两两都能配对', args: [[5, 5, 5, 5], 10], expected: 2 },
    { name: '大件刚好配上小件', args: [[6, 4, 4], 10], expected: 2 },
    { name: '只有一次调用', args: [[4], 4], expected: 1 },
    { name: '每轮刚好装满', args: [[1, 2, 9, 10], 11], expected: 2 },
    { name: '全部等于预算', args: [[10, 10, 10], 10], expected: 3 },
  ],
  examples: [
    {
      input: 'toolCosts = [1, 2, 3], roundBudget = 3',
      output: '2',
      explain: '第一轮放 1 + 2 = 3，第二轮放 3，两轮就排完了。',
    },
    {
      input: 'toolCosts = [3, 5, 3, 4], roundBudget = 5',
      output: '4',
      explain: '任意两个调用相加都超过 5，所以每个调用各占一轮，一共四轮。',
    },
    {
      input: 'toolCosts = [1, 9], roundBudget = 5',
      output: '-1',
      explain: '成本为 9 的调用自己就超过了预算 5，无论怎么排都排不下，返回 -1。',
    },
  ],
  constraints: [
    '0 <= toolCosts.length <= 50000',
    '1 <= toolCosts[i] <= 100000',
    '1 <= roundBudget <= 100000',
  ],
  hints: [
    '先看清每一轮的约束：最多两个调用，两个的成本之和不能超过 roundBudget。要回答的问题是 —— 成本最高的那个调用，安排在哪一轮最划算？',
    '轮数要最少，每一轮就该尽量塞满两个调用。那么最贵的调用能不能和最便宜的那个凑成一轮？如果连最便宜的都配不上它，它还能和谁配对？想清楚这一点，就知道该把哪些调用单独放一轮。',
    '先把 toolCosts 从小到大排序，再放左右两个指针，分别指向当前最便宜和最贵的调用。比较两者之和与 roundBudget：放得下就让两个指针一起向中间收，放不下就让最贵的单独占一轮、只把右指针往左移。每处理一次轮数加一，两个指针相遇时再单独算一轮。开始配对之前，先检查有没有单个调用就超过 roundBudget。',
  ],
  knowledge: [
    'TypeScript：数组中 sort 的比较函数 (a, b) => a - b 为什么不能省略',
    '算法：排序加双指针的贪心配对（LeetCode 881 变体）',
    'Agent：并行工具调用的「每轮数量上限」与「每轮成本预算」是两件事',
  ],
}]
