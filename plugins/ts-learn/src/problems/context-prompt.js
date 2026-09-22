/**
 * 上下文注入与 System Prompt 方向的题库。
 *
 * 契约见 docs/PROBLEM_SCHEMA.md：每个题目的 `solution` 必须通过自己的全部用例，
 * `starter` 必须至少失败一个用例。
 *
 * @module problems/context-prompt
 */

/** @type {import('../problem-schema.js').Problem[]} */
export const problems = [
  {
    id: 'context-token-budget-trim',
    title: '上下文注入的 token 预算裁剪',
    difficulty: 'medium',
    theme: 'context-injection',
    algorithms: ['贪心', '排序'],
    story:
      '把检索到的资料塞进上下文时，token 预算总是不够用。可以把整块资料先放进去，'
      + '最后一块放不下就切一刀，尽量把预算用满，而不是剩下一堆没用的空位。',
    task:
      '实现 trimContext：items 是待注入的资料块，每块有 tokens（占用 token 数）和 value（有用程度）；'
      + 'budget 是这次注入的 token 上限。按「value 除以 tokens 从大到小」处理：放得下就整块放入，'
      + '放不下就用剩余预算切下最后一块，这一块的收益是 Math.floor(value * 剩余预算 / tokens)。'
      + '返回总收益（整数）。',
    entry: 'trimContext',
    signature:
      'export function trimContext(items: { id: string; tokens: number; value: number }[], budget: number): number',
    starter: [
      '// 思路提示：先想清楚「优先放哪一块」的判据，再考虑放不下时怎么切。',
      '// 1) 每块资料有两个数字：成本 tokens 和收益 value，不能只看其中一个。',
      '// 2) 排完序后用 remaining 记录剩余预算，从左到右扫描。',
      '// 3) 整块放不下时，用剩余预算切一刀，然后就可以结束了。',
      'export function trimContext(items: { id: string; tokens: number; value: number }[], budget: number): number {',
      '  // TODO: 在这里写你的实现',
      '  return 0',
      '}',
    ].join('\n'),
    solution: [
      'export function trimContext(items: { id: string; tokens: number; value: number }[], budget: number): number {',
      '  const order = items.map((item, index) => ({ item, index }))',
      '  order.sort((left, right) => {',
      '    const leftScore = left.item.value * right.item.tokens',
      '    const rightScore = right.item.value * left.item.tokens',
      '    if (leftScore !== rightScore) return rightScore - leftScore',
      '    return left.index - right.index',
      '  })',
      '  let remaining = budget',
      '  let total = 0',
      '  for (const { item } of order) {',
      '    if (remaining <= 0) break',
      '    if (item.tokens <= remaining) {',
      '      total += item.value',
      '      remaining -= item.tokens',
      '      continue',
      '    }',
      '    total += Math.floor((item.value * remaining) / item.tokens)',
      '    remaining = 0',
      '  }',
      '  return total',
      '}',
    ].join('\n'),
    tests: [
      {
        name: '示例 1：切下最后一块',
        args: [[{ id: 'a', tokens: 2, value: 4 }, { id: 'b', tokens: 3, value: 3 }], 4],
        expected: 6,
        public: true,
      },
      { name: '示例 2：预算为零', args: [[{ id: 'a', tokens: 1, value: 1 }], 0], expected: 0, public: true },
      {
        name: '示例 3：预算装下全部',
        args: [[{ id: 'a', tokens: 1, value: 5 }, { id: 'b', tokens: 2, value: 2 }], 10],
        expected: 7,
        public: true,
      },
      { name: '空列表', args: [[], 5], expected: 0 },
      {
        name: '第一块就放不下',
        args: [[{ id: 'a', tokens: 5, value: 10 }, { id: 'b', tokens: 4, value: 4 }], 2],
        expected: 4,
      },
      {
        name: '性价比相同',
        args: [[{ id: 'a', tokens: 2, value: 4 }, { id: 'b', tokens: 4, value: 8 }], 3],
        expected: 6,
      },
      {
        name: '每块恰好占一个 token',
        args: [[{ id: 'a', tokens: 1, value: 1 }, { id: 'b', tokens: 1, value: 1 }, { id: 'c', tokens: 1, value: 1 }], 2],
        expected: 2,
      },
      { name: '单块超过预算', args: [[{ id: 'a', tokens: 100, value: 100 }], 50], expected: 50 },
      { name: '收益不整除时向下取整', args: [[{ id: 'a', tokens: 3, value: 5 }], 2], expected: 3 },
    ],
    examples: [
      {
        input: 'items = [{ id: "a", tokens: 2, value: 4 }, { id: "b", tokens: 3, value: 3 }], budget = 4',
        output: '6',
        explain: 'a 的性价比 2 高于 b 的 1：先整块放入 a（用掉 2，收益 4），剩余 2 切下 b 的三分之二，收益 floor(3 * 2 / 3) = 2，共 6。',
      },
      {
        input: 'items = [{ id: "a", tokens: 1, value: 1 }], budget = 0',
        output: '0',
        explain: '预算为 0，任何一块都放不下，收益为 0。',
      },
      {
        input: 'items = [{ id: "a", tokens: 1, value: 5 }, { id: "b", tokens: 2, value: 2 }], budget = 10',
        output: '7',
        explain: '预算足够，两块都整块放入，收益 5 + 2 = 7。',
      },
    ],
    constraints: [
      '1 <= items.length <= 100',
      '1 <= item.tokens <= 100',
      '0 <= item.value <= 100',
      '0 <= budget <= 1000',
      '每块的 id 互不相同',
    ],
    hints: [
      '每块资料有两个数字：tokens 是成本，value 是收益。预算有限时，先问自己：凭哪一个数字决定谁先放进去才算公平？',
      '判据是「单位 token 的收益」，也就是 value 除以 tokens，而不是 value 本身。再想一想：当两块的性价比完全一样时，先放哪一块会让总收益变化吗？',
      '把每块资料和它的原始下标一起放进数组，按 value * 对方的 tokens 交叉相乘从大到小排序（相等时下标小的在前），这样比较不会引入小数。然后用 remaining = budget 从左到右扫描：整块放得下就计入 value 并扣掉 tokens；放不下就计入 floor(value * remaining / tokens) 并结束循环。',
    ],
    knowledge: [
      'TypeScript：用 { tokens: number; value: number }[] 这样的结构类型描述对象数组参数',
      '算法：分数背包的贪心 —— 按性价比排序，最后一块可以切开（LeetCode 变体）',
      'Agent：上下文窗口有限，注入前必须做 token 预算裁剪，否则关键指令会被资料挤出去',
    ],
  },
  {
    id: 'system-prompt-min-chunk-peak',
    title: 'System Prompt 切块峰值',
    difficulty: 'medium',
    theme: 'system-prompt',
    algorithms: ['二分答案', '贪心'],
    story:
      'System Prompt 太长时，网关要求把它切成若干块分别发送。切块必须按原文顺序连续地切，'
      + '不能打乱段落。你希望切完之后最大的那一块尽量小，这样每次请求的延迟更可控。',
    task:
      '实现 minChunkPeak：segments 是 System Prompt 每一段占用的 token 数，顺序不能打乱；'
      + 'chunks 是必须切成的块数，每块至少包含一段，且各块内容连续。'
      + '枚举所有符合要求的切法，返回「最大块 token 数」的最小可能值。',
    entry: 'minChunkPeak',
    signature: 'export function minChunkPeak(segments: number[], chunks: number): number',
    starter: [
      '// 思路提示：直接枚举所有切法太慢，先想「给定一个上限，能不能切得出来」。',
      '// 1) 上限 limit 越大，需要的块数越少，这个关系是单调的。',
      '// 2) 答案一定落在 [最大的一段, 全部之和] 这个区间里。',
      '// 3) 用判定函数把区间不断缩小。',
      'export function minChunkPeak(segments: number[], chunks: number): number {',
      '  // TODO: 在这里写你的实现',
      '  return 0',
      '}',
    ].join('\n'),
    solution: [
      'export function minChunkPeak(segments: number[], chunks: number): number {',
      '  let low = 0',
      '  let high = 0',
      '  for (const segment of segments) {',
      '    if (segment > low) low = segment',
      '    high += segment',
      '  }',
      '  const feasible = (limit: number): boolean => {',
      '    let used = 1',
      '    let current = 0',
      '    for (const segment of segments) {',
      '      if (current + segment > limit) {',
      '        used += 1',
      '        current = segment',
      '      } else {',
      '        current += segment',
      '      }',
      '    }',
      '    return used <= chunks',
      '  }',
      '  while (low < high) {',
      '    const mid = Math.floor((low + high) / 2)',
      '    if (feasible(mid)) high = mid',
      '    else low = mid + 1',
      '  }',
      '  return low',
      '}',
    ].join('\n'),
    tests: [
      { name: '示例 1：五段切两块', args: [[7, 2, 5, 10, 8], 2], expected: 18, public: true },
      { name: '示例 2：递增五段切两块', args: [[1, 2, 3, 4, 5], 2], expected: 9, public: true },
      { name: '示例 3：只切一块', args: [[1, 2, 3, 4, 5], 1], expected: 15, public: true },
      { name: '每段单独一块', args: [[1, 2, 3, 4, 5], 5], expected: 5 },
      { name: '只有一段', args: [[9], 1], expected: 9 },
      { name: '各段等长', args: [[4, 4, 4, 4], 2], expected: 8 },
      { name: '大段必须独占一块', args: [[10, 1, 1, 1, 1, 1, 1, 1, 1, 1], 3], expected: 10 },
      { name: '两头大中间小', args: [[5, 1, 5], 2], expected: 6 },
      { name: '需要反复试探的切法', args: [[2, 3, 1, 2, 4, 3], 3], expected: 6 },
    ],
    examples: [
      {
        input: 'segments = [7, 2, 5, 10, 8], chunks = 2',
        output: '18',
        explain: '切成 [7,2,5] 与 [10,8] 时最大块是 18；任何别的切法最大块都不小于 18。',
      },
      {
        input: 'segments = [1, 2, 3, 4, 5], chunks = 2',
        output: '9',
        explain: '切成 [1,2,3,4] 与 [5] 时最大块是 10，而 [1,2,3] 与 [4,5] 的最大块是 9，更小。',
      },
      {
        input: 'segments = [9], chunks = 1',
        output: '9',
        explain: '只有一段，只能切成一块，峰值就是它自己。',
      },
    ],
    constraints: [
      '1 <= segments.length <= 200',
      '1 <= segments[i] <= 1000',
      '1 <= chunks <= segments.length',
    ],
    hints: [
      '要求的是「最大的那一块能有多小」。先别想怎么切，先问自己：如果别人给你一个候选上限 limit，你能不能只扫一遍数组，就判断出能不能在 chunks 块之内切完？',
      'limit 变大时需要的块数会变少，这个关系是单调的。既然单调，你还需要把每个 limit 都试一遍吗？',
      '答案的范围是 [所有段的最大值, 所有段之和]。写一个判定函数：从左往右累加，一旦加上下一段就超过 limit 就另起一块并让块数加一，最后看块数是否小于等于 chunks。然后在这个区间上二分：可行的上限往左收，不可行的往右收。',
    ],
    knowledge: [
      'TypeScript：给内部辅助箭头函数标注 (limit: number) => boolean 这样的函数类型',
      '算法：二分答案 + 贪心判定，把「求最小值」转化成「判断可行性」（LeetCode 410 变体）',
      'Agent：长 System Prompt 分块发送时，压低最大块的大小能减少单次请求的延迟和截断风险',
    ],
  },
  {
    id: 'system-prompt-section-dedupe',
    title: 'System Prompt 分段去重',
    difficulty: 'medium',
    theme: 'system-prompt',
    algorithms: ['哈希表', '保序去重'],
    story:
      'System Prompt 常常由很多段拼起来：角色设定、工具说明、输出格式……'
      + '不同来源拼接时容易出现内容重复的段落。重复段落既浪费 token，又会分散模型对关键指令的注意力。',
    task:
      '实现 dedupeSections：sections 是待拼接的段落数组。判断两段是否重复前先做归一化：'
      + '把连续空格折叠成一个空格、去掉首尾空格、全部转成小写。归一化后为空的段落直接丢弃；'
      + '重复的段落只保留第一次出现的那一段原文。返回去重后的段落数组，顺序按首次出现排列。',
    entry: 'dedupeSections',
    signature: 'export function dedupeSections(sections: string[]): string[]',
    starter: [
      '// 思路提示：比较之前要先归一化，否则大小写和空格不同就会被当成新段落。',
      '// 1) 归一化只用来做比较，返回时要用第一次出现的原文。',
      '// 2) 归一化后为空字符串的段落要直接丢掉。',
      '// 3) 用一个容器记住见过的归一化结果，再按顺序收集原文。',
      'export function dedupeSections(sections: string[]): string[] {',
      '  // TODO: 在这里写你的实现',
      '  return []',
      '}',
    ].join('\n'),
    solution: [
      'export function dedupeSections(sections: string[]): string[] {',
      '  const seen = new Set<string>()',
      '  const kept: string[] = []',
      '  for (const section of sections) {',
      '    const key = section.split(\' \').filter(part => part !== \'\').join(\' \').toLowerCase()',
      '    if (key === \'\') continue',
      '    if (seen.has(key)) continue',
      '    seen.add(key)',
      '    kept.push(section)',
      '  }',
      '  return kept',
      '}',
    ].join('\n'),
    tests: [
      {
        name: '示例 1：去掉完全相同的段落',
        args: [['你是助手', '你是助手', '工具说明']],
        expected: ['你是助手', '工具说明'],
        public: true,
      },
      {
        name: '示例 2：忽略大小写与首尾空格',
        args: [['Hello', '  hello  ', 'World']],
        expected: ['Hello', 'World'],
        public: true,
      },
      { name: '示例 3：丢掉空段落', args: [['', '   ', '规则一']], expected: ['规则一'], public: true },
      { name: '空数组', args: [[]], expected: [] },
      { name: '保留第一次出现的原文', args: [['  A  ', 'a', 'A']], expected: ['  A  '] },
      { name: '中间连续空格被折叠', args: [['a b', 'a  b', 'c']], expected: ['a b', 'c'] },
      { name: '没有重复', args: [['x', 'y', 'z']], expected: ['x', 'y', 'z'] },
      { name: '全部是空白', args: [['  ', ' ']], expected: [] },
      { name: '顺序按首次出现', args: [['b', 'a', 'B', 'c', 'A']], expected: ['b', 'a', 'c'] },
      { name: '重复出现多次只留一段', args: [['s', 'S', ' s ', 's', 't']], expected: ['s', 't'] },
    ],
    examples: [
      {
        input: 'sections = ["你是助手", "你是助手", "工具说明"]',
        output: '["你是助手", "工具说明"]',
        explain: '第二段与第一段完全重复，被丢弃。',
      },
      {
        input: 'sections = ["Hello", "  hello  ", "World"]',
        output: '["Hello", "World"]',
        explain: '归一化后 "  hello  " 与 "Hello" 相同，保留第一次出现的 "Hello"。',
      },
      {
        input: 'sections = ["", "   ", "规则一"]',
        output: '["规则一"]',
        explain: '归一化后变成空字符串的段落被丢弃。',
      },
    ],
    constraints: [
      '0 <= sections.length <= 200',
      '0 <= sections[i].length <= 100',
      'sections[i] 只包含字母、数字、中文和空格',
    ],
    hints: [
      '注意「重复」的判定标准不是逐字符相等：大小写和多余空格都不应该影响去重结果。那在比较之前要先做什么？',
      '去重以后留下的是第一次出现的那一份，还是最后一次出现的那一份？这两份的长相一定一样吗？',
      '准备一个 Set<string> 存放见过的归一化结果，再准备一个 string[] 存放输出。遍历输入：先把段落归一化（空格折叠、去掉首尾、转小写），归一化后为空就跳过；没见过的把归一化结果放进 Set，并把原文放进输出数组；见过的直接跳过。',
    ],
    knowledge: [
      'TypeScript：Set<string> 的 has 与 add 让「见过没有」的判断是常数时间',
      '算法：哈希去重 + 保持首次出现顺序（LeetCode 变体）',
      'Agent：System Prompt 里的重复段落会浪费 token，也会稀释模型对关键指令的注意力',
    ],
  },
  {
    id: 'context-recent-history-window',
    title: '按预算保留最近对话轮次',
    difficulty: 'medium',
    theme: 'context-injection',
    algorithms: ['后缀和', '双指针'],
    story:
      '对话越来越长，把全部历史都发给模型会直接超出上下文预算。更常见的做法是只保留最近几轮完整对话，'
      + '更早的内容丢掉或者先做摘要，让窗口里始终有最新的问题。',
    task:
      '实现 recentHistoryStart：rounds 是每轮对话消耗的 token 数（从旧到新），'
      + 'budget 是这次请求的 token 总预算，reserve 是留给当前问题和模型回复的 token。'
      + '可用历史预算等于 max(0, budget - reserve)。从最后一轮往前累加，'
      + '保留尽量多的完整轮次，其中最近一轮无论超不超预算都必须保留。'
      + '返回保留窗口第一轮的下标；历史为空时返回 0。',
    entry: 'recentHistoryStart',
    signature: 'export function recentHistoryStart(rounds: number[], budget: number, reserve: number): number',
    starter: [
      '// 思路提示：预算是给整次请求的，历史只能用扣掉 reserve 之后剩下的部分。',
      '// 1) 先算可用历史预算，注意它可能是 0。',
      '// 2) 最近一轮无条件保留，先把它扣掉，余额可能是负数。',
      '// 3) 再从倒数第二轮开始往前扫描，放得下就扩大窗口。',
      'export function recentHistoryStart(rounds: number[], budget: number, reserve: number): number {',
      '  // TODO: 在这里写你的实现',
      '  return 0',
      '}',
    ].join('\n'),
    solution: [
      'export function recentHistoryStart(rounds: number[], budget: number, reserve: number): number {',
      '  if (rounds.length === 0) return 0',
      '  const usable = Math.max(0, budget - reserve)',
      '  let balance = usable - rounds[rounds.length - 1]',
      '  let start = rounds.length - 1',
      '  for (let index = rounds.length - 2; index >= 0; index -= 1) {',
      '    if (rounds[index] > balance) break',
      '    balance -= rounds[index]',
      '    start = index',
      '  }',
      '  return start',
      '}',
    ].join('\n'),
    tests: [
      { name: '示例 1：保留最近两轮', args: [[3, 4, 5], 9, 0], expected: 1, public: true },
      { name: '示例 2：预算充足保留全部', args: [[3, 4, 5], 100, 0], expected: 0, public: true },
      { name: '示例 3：扣掉给当前问题的预留', args: [[2, 2, 2, 2], 7, 3], expected: 2, public: true },
      { name: '空历史', args: [[], 10, 0], expected: 0 },
      { name: '连最近一轮都放不下', args: [[3, 4, 5], 2, 0], expected: 2 },
      { name: '预留比总预算还大', args: [[1, 1, 1], 1, 5], expected: 2 },
      { name: '只有一轮历史', args: [[5], 100, 20], expected: 0 },
      { name: '预算刚好放满两轮', args: [[4, 4, 4], 8, 0], expected: 1 },
      { name: '逐轮往前回退', args: [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 4, 0], expected: 6 },
      { name: '预算为零', args: [[1, 2], 0, 0], expected: 1 },
    ],
    examples: [
      {
        input: 'rounds = [3, 4, 5], budget = 9, reserve = 0',
        output: '1',
        explain: '从最后一轮往前：5 放得下，加上 4 合计 9 也放得下，再加 3 就超了，所以窗口从下标 1 开始。',
      },
      {
        input: 'rounds = [2, 2, 2, 2], budget = 7, reserve = 3',
        output: '2',
        explain: '可用历史预算是 7 - 3 = 4：先留下最后一轮，余额还剩 2，正好再放一轮，窗口从下标 2 开始。',
      },
      {
        input: 'rounds = [3, 4, 5], budget = 2, reserve = 0',
        output: '2',
        explain: '预算连最后一轮的 5 都不够，但最近一轮必须保留，所以窗口里只有下标 2 这一轮。',
      },
    ],
    constraints: [
      '0 <= rounds.length <= 200',
      '1 <= rounds[i] <= 1000',
      '0 <= budget <= 100000',
      '0 <= reserve <= 100000',
    ],
    hints: [
      'budget 是整次请求的预算，历史只能用扣掉 reserve 之后剩下的那部分。再想一想：最后一轮是「先留下」还是「先按预算判断」？',
      '规则已经写明最近一轮必须保留。那么当可用预算比最后一轮还小的时候，扣完最后一轮之后余额是正数还是负数？余额为负时，前面那些轮次还能进来吗？',
      '令 usable = Math.max(0, budget - reserve)，balance = usable 减去最后一轮的 token，start = 最后一轮的下标。然后从倒数第二轮开始往前循环：只要 rounds[index] 不超过 balance，就把它从 balance 里扣掉并更新 start；一旦放不下就跳出循环。',
    ],
    knowledge: [
      'TypeScript：倒着遍历数组写作 for (let index = n - 1; index >= 0; index -= 1)',
      '算法：后缀和扫描（前缀和的镜像）配合双指针式的窗口收缩（LeetCode 变体）',
      'Agent：对话历史要按预算裁剪，否则旧消息会占满上下文窗口，模型反而看不到最新的问题',
    ],
  },
]
