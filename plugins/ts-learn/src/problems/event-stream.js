// 「事件流」方向：多路事件合并、窗口去重计数、乱序事件重排。
// 契约见 docs/PROBLEM_SCHEMA.md。

/** @type {import('../problem-schema.js').Problem[]} */
export const problems = [
  {
    id: 'merge-provider-streams',
    title: '合并多个 Provider 事件流',
    difficulty: 'medium',
    theme: 'event-stream',
    algorithms: ['k 路归并', '多指针'],
    story:
      'Agent 常常同时接好几个模型 Provider，每一路都会按时刻从早到晚吐出事件。'
      + '要把它们拼成一条给界面看的时间线，就得先想清楚：几条各自已经有序的流，'
      + '怎么合并才既快又稳定。',
    task:
      '实现 mergeStreams：streams 是若干路事件时刻数组，每一路内部已经按时刻升序排好，'
      + 'limit 表示每一路最多只取前 limit 条事件。请把它们合并成一个整体升序的数组，'
      + '每个元素是对象 { at, stream }：at 是事件时刻，stream 是它来自第几路（从 0 开始）。'
      + '时刻相同时，stream 小的排在前面。',
    entry: 'mergeStreams',
    signature: 'export function mergeStreams(streams: number[][], limit: number): { at: number, stream: number }[]',
    starter: `// 思路提示：每一路都已经有序，所以任意时刻只需要比较「各路当前的第一个事件」。
// 1) 先按 limit 把每一路截断，最多只看前 limit 条。
// 2) 每一轮在所有路的头部里挑出 at 最小、at 相同时 stream 最小的那一个。
// 3) 把它写进结果，并让那一路的指针往后走一格。
export function mergeStreams(streams: number[][], limit: number): { at: number, stream: number }[] {
  // TODO: 在这里写你的实现
  return []
}`,
    solution: `export function mergeStreams(streams: number[][], limit: number): { at: number, stream: number }[] {
  const cap = Math.max(0, limit)
  const pointers: number[] = streams.map(() => 0)
  const result: { at: number, stream: number }[] = []
  while (true) {
    let best = -1
    for (let index = 0; index < streams.length; index += 1) {
      const position = pointers[index]
      if (position >= cap || position >= streams[index].length) continue
      if (best === -1 || streams[index][position] < streams[best][pointers[best]]) best = index
    }
    if (best === -1) break
    result.push({ at: streams[best][pointers[best]], stream: best })
    pointers[best] += 1
  }
  return result
}`,
    tests: [
      {
        name: '示例 1：两路交错',
        args: [[[1, 4], [2, 3]], 2],
        expected: [{ at: 1, stream: 0 }, { at: 2, stream: 1 }, { at: 3, stream: 1 }, { at: 4, stream: 0 }],
        public: true,
      },
      {
        name: '示例 2：时刻相同按路号',
        args: [[[5, 5], [5]], 2],
        expected: [{ at: 5, stream: 0 }, { at: 5, stream: 0 }, { at: 5, stream: 1 }],
        public: true,
      },
      {
        name: '示例 3：limit 截断每一路',
        args: [[[1, 2, 3], [4, 5, 6]], 2],
        expected: [{ at: 1, stream: 0 }, { at: 2, stream: 0 }, { at: 4, stream: 1 }, { at: 5, stream: 1 }],
        public: true,
      },
      { name: '边界：三路都为空', args: [[[], [], []], 3], expected: [] },
      { name: '边界：没有任何流', args: [[], 3], expected: [] },
      { name: '边界：limit 为 0', args: [[[1, 2], [3]], 0], expected: [] },
      {
        name: '边界：单路且 limit 足够',
        args: [[[7, 8, 9]], 10],
        expected: [{ at: 7, stream: 0 }, { at: 8, stream: 0 }, { at: 9, stream: 0 }],
      },
      {
        name: '三路交错且有时刻相同',
        args: [[[1, 9], [2, 4], [3, 4]], 2],
        expected: [
          { at: 1, stream: 0 },
          { at: 2, stream: 1 },
          { at: 3, stream: 2 },
          { at: 4, stream: 1 },
          { at: 4, stream: 2 },
          { at: 9, stream: 0 },
        ],
      },
      {
        name: '边界：limit 只截断其中一路',
        args: [[[1, 100, 101], [2]], 1],
        expected: [{ at: 1, stream: 0 }, { at: 2, stream: 1 }],
      },
    ],
    examples: [
      {
        input: 'streams = [[1, 4], [2, 3]], limit = 2',
        output: '[{ at: 1, stream: 0 }, { at: 2, stream: 1 }, { at: 3, stream: 1 }, { at: 4, stream: 0 }]',
        explain: '两路都已经有序，每次都从两路的头部里取时刻更小的那个。',
      },
      {
        input: 'streams = [[5, 5], [5]], limit = 2',
        output: '[{ at: 5, stream: 0 }, { at: 5, stream: 0 }, { at: 5, stream: 1 }]',
        explain: '时刻完全相同时按 stream 从小到大出队，结果才是唯一的。',
      },
      {
        input: 'streams = [[1, 2], [3]], limit = 0',
        output: '[]',
        explain: 'limit 为 0 表示每一路都不取事件，直接返回空数组。',
      },
    ],
    constraints: [
      '0 <= streams.length <= 50',
      '0 <= streams[i].length <= 200',
      '0 <= streams[i][j] <= 1000000000，同一路内非递减',
      '0 <= limit <= 200',
    ],
    hints: [
      '先把约束复述一遍：每一路自己已经有序，你唯一要决定的是「下一步该从哪一路取事件」。'
      + '想一下：既然每一路只有头部那一个事件是候选，你一共需要比较几个数？',
      '时刻相同时该谁先出？题面要求按路号从小到大。也就是说你的挑选规则要同时看两个关键字，'
      + '先比时刻、再比路号 —— 你能用一个循环把这条规则写清楚吗？',
      '用一个指针数组 pointers 记下每一路取到了第几个，再开一个循环：每轮遍历所有路，'
      + '在「还没取完、也没超过 limit」的路里挑出时刻最小、时刻相同则路号最小的那一路，'
      + '把 { at, stream } 推进结果，然后 pointers[那一路] 加一；一路都挑不出来时结束。',
    ],
    knowledge: [
      'TypeScript：返回对象数组时，用 { at: number, stream: number }[] 把每个元素的字段写清楚',
      '算法：k 路归并（LeetCode 23 合并 K 个升序链表的数组版本）',
      'Agent：合并事件流时为什么必须规定「时刻相同按 provider 顺序」的稳定规则',
    ],
  },
  {
    id: 'dedup-window-count',
    title: '滑动窗口内的事件去重计数',
    difficulty: 'medium',
    theme: 'event-stream',
    algorithms: ['滑动窗口', '哈希表'],
    story:
      '同一个工具在一次回答里可能被反复调用，事件流里就会堆满重复的调用 id。'
      + '为了判断 Agent 是不是在原地打转，你要在任意一段最近的事件里数出'
      + '「有多少个不同的工具」，而不是数总条数。',
    task:
      '实现 countUniqueInWindow：ids 是按到达顺序排列的工具调用 id，window 是窗口长度。'
      + '对每个位置 i，考虑以 i 结尾、下标范围从 max(0, i - window + 1) 到 i 的窗口，'
      + '统计其中不同 id 的个数。请把所有位置上的答案按 i 从小到大放进一个数组返回。',
    entry: 'countUniqueInWindow',
    signature: 'export function countUniqueInWindow(ids: string[], window: number): number[]',
    starter: `// 思路提示：窗口每往右滑一格，只会「进来一个 id、出去一个 id」，不必重数整个窗口。
// 1) 用一个 Map 记录窗口内每个 id 各出现了多少次。
// 2) 右端加入新 id 时计数加一；左端移出旧 id 时计数减一，减到 0 就把它从 Map 删掉。
// 3) Map 里还剩多少个 key，就是当前位置的答案。
export function countUniqueInWindow(ids: string[], window: number): number[] {
  // TODO: 在这里写你的实现
  return []
}`,
    solution: `export function countUniqueInWindow(ids: string[], window: number): number[] {
  const counts = new Map<string, number>()
  const result: number[] = []
  for (let index = 0; index < ids.length; index += 1) {
    const arrived = ids[index]
    counts.set(arrived, (counts.get(arrived) ?? 0) + 1)
    const expired = index - window
    if (expired >= 0) {
      const leaving = ids[expired]
      const rest = (counts.get(leaving) ?? 0) - 1
      if (rest <= 0) counts.delete(leaving)
      else counts.set(leaving, rest)
    }
    result.push(counts.size)
  }
  return result
}`,
    tests: [
      { name: '示例 1：窗口内出现重复', args: [['a', 'a', 'b'], 2], expected: [1, 1, 2], public: true },
      { name: '示例 2：窗口还没长满', args: [['a', 'b', 'c'], 2], expected: [1, 2, 2], public: true },
      { name: '示例 3：窗口比数组还长', args: [['x'], 5], expected: [1], public: true },
      { name: '边界：没有任何事件', args: [[], 3], expected: [] },
      { name: '边界：窗口长度为 1', args: [['a', 'b', 'c', 'd'], 1], expected: [1, 1, 1, 1] },
      { name: '全部 id 相同', args: [['a', 'a', 'a', 'a'], 2], expected: [1, 1, 1, 1] },
      { name: '窗口恰好覆盖整段', args: [['a', 'b', 'a', 'b'], 4], expected: [1, 2, 2, 2] },
      { name: '有 id 滑出窗口', args: [['a', 'b', 'c', 'a', 'c'], 3], expected: [1, 2, 3, 3, 2] },
    ],
    examples: [
      {
        input: "ids = ['a', 'a', 'b'], window = 2",
        output: '[1, 1, 2]',
        explain: '最后一个窗口盖住 a 和 b，两个不同 id。',
      },
      {
        input: "ids = ['a', 'b', 'c'], window = 2",
        output: '[1, 2, 2]',
        explain: '前两个窗口还没长到长度 2，只有已经到达的事件算数。',
      },
      {
        input: "ids = ['x'], window = 5",
        output: '[1]',
        explain: '窗口比数组还长时，等价于对整段数组去重计数。',
      },
    ],
    constraints: [
      '0 <= ids.length <= 100000',
      '1 <= window <= ids.length + 5',
      '1 <= ids[i].length <= 20，只含小写字母',
    ],
    hints: [
      '先复述约束：窗口每次只往右挪一格，长度固定，只是还没长满时会短一些。'
      + '想一下：相邻两个窗口之间，有多少元素其实是同一批？',
      '既然相邻窗口几乎共享同一批元素，能不能只在上一格的答案上做「加一个、减一个」的增量修改，'
      + '而不是每个位置都重新数一遍？关键问题是：一个 id 要满足什么条件才算真正离开了窗口？',
      '用一个 Map<string, number> 记录窗口内每个 id 的出现次数。每轮先把 ids[i] 的计数加一；'
      + '当 i - window >= 0 时，把 ids[i - window] 的计数减一，减到 0 就从 Map 里删掉这个 key；'
      + '最后把 Map.size 推进答案数组，它正好等于窗口内不同 id 的个数。',
    ],
    knowledge: [
      'TypeScript：用 Map<string, number> 计数，比用普通对象更能表达「数量」这层含义',
      '算法：滑动窗口 + 哈希计数（LeetCode 变体）',
      'Agent：为什么判断 Agent 是否打转要看「不同工具的个数」而不是调用总次数',
    ],
  },
  {
    id: 'reorder-arrived-events',
    title: '乱序到达事件的顺序修复',
    difficulty: 'medium',
    theme: 'event-stream',
    algorithms: ['桶排序思想', '模拟'],
    story:
      'Agent 的事件经常从多条网络通道回来，序号 2 完全可能比序号 1 先到。'
      + '要把它还原成一条完整、按序号排列的事件流，你必须同时处理重复到达'
      + '和彻底丢失的序号。',
    task:
      '实现 reorderEvents：events 是若干条形如 [seq, payload] 的到达记录，'
      + 'total 是这一轮事件的期望总数，合法序号是 1 到 total。请返回一个长度为 total 的数组：'
      + '下标 seq - 1 处放该序号对应的 payload；同一个序号到达多次时只保留最早到达的那一条；'
      + '从未到达过的序号放 null；序号不在 1 到 total 范围内的记录直接忽略。',
    entry: 'reorderEvents',
    signature: 'export function reorderEvents(events: [number, string][], total: number): (string | null)[]',
    starter: `// 思路提示：序号本身就告诉你「这条事件该待在结果数组的第几个格子」。
// 1) 先造一个长度为 total、初值全是 null 的数组。
// 2) 遍历到达记录：序号不在 1..total 范围内的直接跳过。
// 3) 只有该格子还是 null 时才写入 payload，这样先到的记录会赢。
export function reorderEvents(events: [number, string][], total: number): (string | null)[] {
  // TODO: 在这里写你的实现
  return []
}`,
    solution: `export function reorderEvents(events: [number, string][], total: number): (string | null)[] {
  const slots: (string | null)[] = []
  for (let index = 0; index < total; index += 1) slots.push(null)
  for (const record of events) {
    const seq = record[0]
    const payload = record[1]
    if (seq < 1 || seq > total) continue
    if (slots[seq - 1] !== null) continue
    slots[seq - 1] = payload
  }
  return slots
}`,
    tests: [
      { name: '示例 1：两条记录颠倒到达', args: [[[2, 'b'], [1, 'a']], 2], expected: ['a', 'b'], public: true },
      { name: '示例 2：中间序号丢失', args: [[[3, 'c'], [1, 'a']], 3], expected: ['a', null, 'c'], public: true },
      { name: '示例 3：同一序号到达两次', args: [[[1, 'a'], [1, 'b']], 1], expected: ['a'], public: true },
      { name: '边界：没有任何记录', args: [[], 3], expected: [null, null, null] },
      { name: '边界：期望总数为 0', args: [[], 0], expected: [] },
      {
        name: '边界：序号越界被忽略',
        args: [[[0, 'x'], [4, 'y'], [2, 'ok']], 2],
        expected: [null, 'ok'],
      },
      {
        name: '五条记录完全打乱',
        args: [[[5, 'e'], [3, 'c'], [1, 'a'], [4, 'd'], [2, 'b']], 5],
        expected: ['a', 'b', 'c', 'd', 'e'],
      },
      {
        name: '重复到达时保留先到的一条',
        args: [[[2, 'second'], [2, 'first'], [1, 'a']], 2],
        expected: ['a', 'second'],
      },
      { name: '全部序号都丢失', args: [[[7, 'x']], 3], expected: [null, null, null] },
    ],
    examples: [
      {
        input: "events = [[2, 'b'], [1, 'a']], total = 2",
        output: "['a', 'b']",
        explain: '序号 2 虽然先到，结果里仍然按序号从小到大排。',
      },
      {
        input: "events = [[3, 'c'], [1, 'a']], total = 3",
        output: "['a', null, 'c']",
        explain: '序号 2 从未到达，用 null 占住它的位置。',
      },
      {
        input: "events = [[1, 'a'], [1, 'b']], total = 1",
        output: "['a']",
        explain: '同一序号重复到达时，最早到达的那一条胜出。',
      },
    ],
    constraints: [
      '0 <= events.length <= 100000',
      '0 <= total <= 100000',
      'seq 为整数，payload 为长度 1~20 的字符串',
    ],
    hints: [
      '先复述约束：结果数组的长度由 total 决定，而不是由 events 的长度决定。'
      + '想一下：一条序号为 3 的记录，应该落在结果数组的哪个下标上？',
      '序号和下标是一一对应的，所以这题根本不需要比较排序 —— 序号自己就给出了位置。'
      + '那么当下标处已经有值了，说明发生了什么？两条记录里你该留下哪一条？',
      '先造一个长度为 total、初值全是 null 的数组 slots。然后按到达顺序遍历 events：'
      + '取出 [seq, payload]，如果 seq 小于 1 或大于 total 就跳过；'
      + '如果 slots[seq - 1] 仍然是 null 就写入 payload，否则跳过，做到先到先得。最后返回 slots。',
    ],
    knowledge: [
      'TypeScript：为什么用 (string | null)[] 表示「缺失」比用 undefined 更安全',
      '算法：桶排序思想 —— 关键值本身就是下标时不需要比较排序（LeetCode 变体）',
      'Agent：事件流为什么要带序号，它如何同时解决幂等去重和缺口检测',
    ],
  },
]
