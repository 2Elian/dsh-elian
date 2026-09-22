/**
 * LLM Provider 与 Gateway 方向的题目：请求限流放行、重复 Prompt 合并、Provider 能力匹配。
 *
 * 契约见 docs/PROBLEM_SCHEMA.md；本文件只导出 `problems`，题目代码全部是纯函数。
 */

/** @type {import('../problem-schema.js').Problem[]} */
export const problems = [
  {
    id: 'gateway-admission-schedule',
    title: '网关限流放行时刻',
    difficulty: 'medium',
    theme: 'gateway',
    algorithms: ['模拟', '队列', '贪心'],
    story:
      '你的 Agent 在一次对话里可能同时发出很多次 LLM 请求，但 Gateway 每秒只允许放行固定的数量，'
      + '多出来的请求只能排队等待。你需要算出每个请求真正被放行的时刻，才能向用户解释这些延迟是从哪里来的。',
    task:
      '实现 scheduleRequests：给定按非递减顺序排列的请求到达时刻（单位：秒）arrivals，'
      + '以及每个整数秒最多能放行的请求数 limit，返回一个长度相同的数组，'
      + '第 i 个元素是第 i 个请求被放行的秒数。规则：在第 t 秒，先把所有到达时刻小于等于 t 的请求'
      + '按到达顺序放入队尾，再从队头最多放行 limit 个请求，它们的放行时刻都是 t；先到达的请求先被放行。',
    entry: 'scheduleRequests',
    signature: 'export function scheduleRequests(arrivals: number[], limit: number): number[]',
    starter: [
      '// 思路提示：每个整数秒最多放行 limit 个请求，多出来的只能等到下一秒。',
      '// 提示：放行的先后顺序由请求到达的先后决定，和到达时刻的大小无关。',
      '// 提示：用一个队列保存「已经到达但还没被放行」的请求下标。',
      'export function scheduleRequests(arrivals: number[], limit: number): number[] {',
      '  // TODO: 在这里写你的实现',
      '  return []',
      '}',
    ].join('\n'),
    solution: [
      'export function scheduleRequests(arrivals: number[], limit: number): number[] {',
      '  const result: number[] = new Array(arrivals.length).fill(0)',
      '  const queue: number[] = []',
      '  let head = 0',
      '  let next = 0',
      '  let second = 0',
      '  while (head < queue.length || next < arrivals.length) {',
      '    if (head === queue.length) second = arrivals[next]',
      '    while (next < arrivals.length && arrivals[next] <= second) {',
      '      queue.push(next)',
      '      next += 1',
      '    }',
      '    let quota = limit',
      '    while (quota > 0 && head < queue.length) {',
      '      result[queue[head]] = second',
      '      head += 1',
      '      quota -= 1',
      '    }',
      '    second += 1',
      '  }',
      '  return result',
      '}',
    ].join('\n'),
    tests: [
      { name: '示例 1：容量充足', args: [[1, 1, 1], 3], expected: [1, 1, 1], public: true },
      { name: '示例 2：排队等待', args: [[1, 1, 1], 2], expected: [1, 1, 2], public: true },
      { name: '示例 3：逐个放行', args: [[1, 2, 3], 1], expected: [1, 2, 3], public: true },
      { name: '边界：空输入', args: [[], 2], expected: [] },
      { name: '尖峰：每秒只放行一个', args: [[5, 5, 5, 5], 1], expected: [5, 6, 7, 8] },
      { name: '空档：队列清空后跳到下一个到达时刻', args: [[1, 1, 5], 1], expected: [1, 2, 5] },
      { name: '五个请求挤在同一秒', args: [[10, 10, 10, 10, 10], 2], expected: [10, 10, 11, 11, 12] },
      {
        name: '规模：两秒内到达十个请求',
        args: [[1, 1, 1, 1, 1, 1, 1, 2, 2, 2], 3],
        expected: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4],
      },
    ],
    examples: [
      {
        input: 'arrivals = [1, 1, 1], limit = 2',
        output: '[1, 1, 2]',
        explain: '第 1 秒只能放行 2 个，第 3 个请求排到第 2 秒才被放行。',
      },
      {
        input: 'arrivals = [5, 5, 5, 5], limit = 1',
        output: '[5, 6, 7, 8]',
        explain: '同一秒到达 4 个请求，每秒放行 1 个，后面的依次顺延到下一整秒。',
      },
    ],
    constraints: [
      '0 <= arrivals.length <= 20000',
      'arrivals 按非递减顺序给出，1 <= arrivals[i] <= 100000',
      '1 <= limit <= 1000',
    ],
    hints: [
      '每个整数秒最多放行 limit 个请求，多出来的只能等到下一秒。先想清楚：当第 t 秒到来时，哪些请求已经可以参与放行，它们的先后顺序又是由什么决定的？',
      '同一秒里放行哪几个请求，看的是它们到达的早晚，而不是到达时刻的数值大小。那么应该用一个什么顺序的结构，来保存「已经到达、但还没被放行」的请求？',
      '用一个队头指针 head 扫过保存请求下标的队列：每个整数秒 t 先把所有到达时刻小于等于 t 的请求推入队尾，再从队头最多取 limit 个，把结果的第 i 位写成 t；队列空了就把 t 直接跳到下一个到达时刻，避免空转。',
    ],
    knowledge: [
      'TypeScript：参数类型 number[] 与 number 的区别，以及返回值类型数组的写法',
      '算法：模拟 + 队列（FIFO 先到先服务）',
      'Agent：为什么 Gateway 要对并发请求排队限流，而不是直接全部转发',
    ],
  },
  {
    id: 'llm-duplicate-prompt-grouping',
    title: '重复 Prompt 合并分组',
    difficulty: 'medium',
    theme: 'llm-provider',
    algorithms: ['哈希表', '字符串规范化', '分组'],
    story:
      '很多用户会同时问同一个问题，发出去的 Prompt 一字不差。如果每一次都真的调用一次 LLM，费用会成倍上涨。'
      + '你需要把可以合并成一次调用的请求放进同一组，让 Agent 只调用一次，再把结果分发给所有等待的人。',
    task:
      '实现 groupDuplicatePrompts：把内容相同的 Prompt 归为一组，返回每一组原始下标的数组。'
      + '比较之前先做规范化：去掉首尾空白，把中间的连续空白（空格、换行、制表符）合并成一个空格，再整体转成小写。'
      + '每组内的下标从小到大排列，组与组之间按每组第一个下标从小到大排列；空数组返回空数组。',
    entry: 'groupDuplicatePrompts',
    signature: 'export function groupDuplicatePrompts(prompts: string[]): number[][]',
    starter: [
      '// 思路提示：内容相同的 Prompt 只需要真正调用一次 LLM，其余请求复用结果。',
      '// 提示：判断「相同」之前，先把大小写和多余的空白规范化掉。',
      '// 提示：用 Map 把规范化后的文本映射到它所属的那一组下标。',
      'export function groupDuplicatePrompts(prompts: string[]): number[][] {',
      '  // TODO: 在这里写你的实现',
      '  return []',
      '}',
    ].join('\n'),
    solution: [
      'export function groupDuplicatePrompts(prompts: string[]): number[][] {',
      '  const groups = new Map<string, number[]>()',
      '  const result: number[][] = []',
      '  for (let i = 0; i < prompts.length; i += 1) {',
      "    const key = prompts[i].trim().replace(/\\s+/g, ' ').toLowerCase()",
      '    const group = groups.get(key)',
      '    if (group === undefined) {',
      '      const fresh = [i]',
      '      groups.set(key, fresh)',
      '      result.push(fresh)',
      '    } else {',
      '      group.push(i)',
      '    }',
      '  }',
      '  return result',
      '}',
    ].join('\n'),
    tests: [
      { name: '示例 1：内容完全相同', args: [['你好', '你好', '你好']], expected: [[0, 1, 2]], public: true },
      { name: '示例 2：大小写和空白不同', args: [['Hello', '  hello ', 'HELLO']], expected: [[0, 1, 2]], public: true },
      { name: '示例 3：内容不同各自成组', args: [['a', 'b', 'a']], expected: [[0, 2], [1]], public: true },
      { name: '边界：空输入', args: [[]], expected: [] },
      { name: '边界：空串与纯空白规范化后相同', args: [['', '   ', '']], expected: [[0, 1, 2]] },
      { name: '换行与连续空格都要合并', args: [['prompt  one', 'prompt one', 'prompt\n  two']], expected: [[0, 1], [2]] },
      { name: '前后空白与大小写混合', args: [['LLM  Call ', 'llm call', 'Llm   Call']], expected: [[0, 1, 2]] },
      { name: '只有一个请求', args: [['only one']], expected: [[0]] },
      {
        name: '多组保序：按每组第一个下标排列',
        args: [['b', 'a', 'b', 'c', 'a', 'c', 'b']],
        expected: [[0, 2, 6], [1, 4], [3, 5]],
      },
    ],
    examples: [
      {
        input: "prompts = ['Hello', '  hello ', 'HELLO']",
        output: '[[0, 1, 2]]',
        explain: '三个 Prompt 去掉首尾空白并转成小写后都是 hello，可以合并成一次 LLM 调用。',
      },
      {
        input: "prompts = ['a', 'b', 'a']",
        output: '[[0, 2], [1]]',
        explain: '下标 0 和 2 内容相同先成一组，下标 1 自成一组，组按第一个下标排序。',
      },
    ],
    constraints: [
      '0 <= prompts.length <= 20000',
      '每个 Prompt 的长度在 0 到 200 之间',
      '返回结果里每个下标恰好出现一次',
    ],
    hints: [
      '两个 Prompt 只要规范化之后完全一样，就可以合并成一次 LLM 调用。先问自己：规范化要做哪几步，大小写或空白不同但字符相同的两个 Prompt，算同一组吗？',
      '如果把所有 Prompt 两两比较，复杂度会高得无法接受。有没有办法让每个 Prompt 只花和它自身长度成正比的时间，就直接知道它属于哪一组？',
      '准备一个 Map<string, number[]>，键是规范化后的文本，值是该组已经收集到的下标数组。从头遍历 Prompt，算出键以后：键不存在就先往结果数组里放一个新的空组并记进 Map，再把当前下标追加进那一组；这样组与组的顺序天然按第一个下标递增。',
    ],
    knowledge: [
      'TypeScript：trim() 与 replace() 都返回新字符串，不会修改原字符串',
      '算法：哈希表分组（LeetCode 49 字母异位词分组同源）',
      'Agent：为什么 Gateway 要对相同 Prompt 做去重合并，一次调用分发多个等待者',
    ],
  },
  {
    id: 'provider-capability-assignment',
    title: 'Provider 能力匹配分配',
    difficulty: 'medium',
    theme: 'llm-provider',
    algorithms: ['哈希表', '贪心', '摊还指针'],
    story:
      '一条 Gateway 后面挂着好几个 LLM Provider，它们支持的能力（比如 chat、vision）和剩余额度都不一样。'
      + '请求来了以后，你要按顺序把它交给第一个既支持这项能力、又还有额度的 Provider，否则这次调用只能失败。',
    task:
      '实现 pickProvider：capabilities[i] 是第 i 个 Provider 支持的能力名列表，quotas[i] 是它还能接多少个请求，'
      + 'needs[j] 是第 j 个请求需要的能力。按请求顺序处理：为 needs[j] 选出下标最小、支持该能力、'
      + '并且 quotas 仍然大于 0 的 Provider，把它的配额减 1 并返回它的下标；如果不存在这样的 Provider，就返回 -1。',
    entry: 'pickProvider',
    signature: 'export function pickProvider(capabilities: string[][], quotas: number[], needs: string[]): number[]',
    starter: [
      '// 思路提示：每个请求都要找「下标最小、支持该能力、还有额度」的 Provider。',
      '// 提示：一个 Provider 的额度被用掉之后不会恢复，这一点能省掉很多重复扫描。',
      '// 提示：先用 Map 建立「能力名 → 支持它的 Provider 下标」索引。',
      'export function pickProvider(capabilities: string[][], quotas: number[], needs: string[]): number[] {',
      '  // TODO: 在这里写你的实现',
      '  return []',
      '}',
    ].join('\n'),
    solution: [
      'export function pickProvider(capabilities: string[][], quotas: number[], needs: string[]): number[] {',
      '  const index = new Map<string, number[]>()',
      '  for (let i = 0; i < capabilities.length; i += 1) {',
      '    for (const name of capabilities[i]) {',
      '      const list = index.get(name)',
      '      if (list === undefined) index.set(name, [i])',
      '      else list.push(i)',
      '    }',
      '  }',
      '  const cursor = new Map<string, number>()',
      '  const remaining = quotas.slice()',
      '  const result: number[] = []',
      '  for (const need of needs) {',
      '    const list = index.get(need)',
      '    if (list === undefined) {',
      '      result.push(-1)',
      '      continue',
      '    }',
      '    let at = cursor.get(need) ?? 0',
      '    while (at < list.length && remaining[list[at]] === 0) at += 1',
      '    cursor.set(need, at)',
      '    if (at === list.length) {',
      '      result.push(-1)',
      '      continue',
      '    }',
      '    remaining[list[at]] -= 1',
      '    result.push(list[at])',
      '  }',
      '  return result',
      '}',
    ].join('\n'),
    tests: [
      {
        name: '示例 1：按顺序用掉额度',
        args: [[['chat'], ['chat', 'vision'], ['vision']], [1, 1, 2], ['chat', 'chat', 'vision']],
        expected: [0, 1, 2],
        public: true,
      },
      {
        name: '示例 2：跳过额度为 0 的 Provider',
        args: [[['chat'], ['chat'], ['chat']], [1, 0, 2], ['chat', 'chat', 'chat']],
        expected: [0, 2, 2],
        public: true,
      },
      {
        name: '示例 3：没有 Provider 支持该能力',
        args: [[['chat'], ['vision']], [5, 5], ['vision', 'chat', 'audio']],
        expected: [1, 0, -1],
        public: true,
      },
      { name: '额度用完后返回 -1', args: [[['chat']], [2], ['chat', 'chat', 'chat']], expected: [0, 0, -1] },
      { name: '边界：有 Provider 但什么能力都不支持', args: [[[], ['vision']], [3, 1], ['chat']], expected: [-1] },
      { name: '边界：没有任何请求', args: [[['chat']], [1], []], expected: [] },
      { name: '边界：没有任何 Provider', args: [[], [], ['chat', 'chat']], expected: [-1, -1] },
      {
        name: '能力交叉：同一个 Provider 被两种能力争抢',
        args: [[['a', 'b'], ['b'], ['a']], [1, 1, 1], ['a', 'b', 'a', 'b']],
        expected: [0, 1, 2, -1],
      },
      {
        name: '混合场景：五种 Provider 与七个请求',
        args: [
          [['chat', 'code'], ['chat'], ['code', 'vision'], ['chat', 'vision'], ['vision']],
          [2, 1, 1, 0, 3],
          ['chat', 'vision', 'code', 'chat', 'vision', 'code', 'vision'],
        ],
        expected: [0, 2, 0, 1, 4, -1, 4],
      },
    ],
    examples: [
      {
        input: "capabilities = [['chat'], ['chat', 'vision']], quotas = [1, 2], needs = ['chat', 'chat', 'vision']",
        output: '[0, 1, 1]',
        explain: '第一个 chat 请求走 Provider 0，它的额度用完后，后面的请求都落到 Provider 1。',
      },
      {
        input: "capabilities = [['chat'], ['vision']], quotas = [5, 5], needs = ['vision', 'audio']",
        output: '[1, -1]',
        explain: 'audio 没有任何 Provider 支持，所以返回 -1。',
      },
    ],
    constraints: [
      '0 <= capabilities.length <= 2000',
      '0 <= needs.length <= 20000',
      '0 <= quotas[i] <= 1000',
      '同一个 Provider 的能力名列表里没有重复',
    ],
    hints: [
      '每个请求都要从所有 Provider 里挑出「下标最小、支持这个能力、并且还有额度」的那一个。先想清楚：一个 Provider 的额度被用完之后，它还有没有可能重新变回候选？',
      '额度只会减少、不会回升。既然是这样，对某一种能力来说，我们还需要每次都从头把所有 Provider 扫一遍吗？能不能记住上一次挑到了第几个，下次从那里继续往后找？',
      '先用一个 Map<string, number[]> 把每种能力映射到支持它的 Provider 下标（按下标从小到大）。再为每种能力维护一个只前进的游标，并复制一份剩余额度数组：处理请求时从游标出发跳过额度为 0 的 Provider，选中后把该额度减 1，游标保持在原地；如果游标走到了列表末尾，说明这种能力已经用尽，返回 -1。',
    ],
    knowledge: [
      'TypeScript：用 Map<string, number[]> 建立「能力名 → Provider 下标」的索引',
      '算法：哈希索引 + 贪心，游标只前进不回头（摊还 O(1)）',
      'Agent：为什么 Gateway 要按「第一个可用 Provider」分配，而不是随机挑一个',
    ],
  },
]
