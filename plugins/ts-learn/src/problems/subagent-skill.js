// 子代理（subagent）与 Skill 方向的题目。契约见 docs/PROBLEM_SCHEMA.md。

/** @type {import('../problem-schema.js').Problem[]} */
export const problems = [
  {
    id: 'subagent-batch-topo',
    title: '子代理任务分批调度',
    difficulty: 'medium',
    theme: 'subagent',
    algorithms: ['拓扑排序', '广度优先搜索', '图'],
    story:
      '子代理可以并行干活，但有些任务必须等别的任务先完成。调度器要把一批任务分成尽可能少的批次：'
      + '同一批次里的子代理可以同时派发，下一批必须等上一批结束。这样用户才能看到清晰的执行步骤。',
    task:
      '实现 planBatches：给定任务总数 n 和依赖表 deps，deps[i] 是任务 i 必须先完成的前置任务编号数组。'
      + '请把任务分批：每个批次装入此刻所有前置都已完成的任务，同一批次内的任务互不依赖，可以并行派发给子代理；'
      + '因此批次数是最少的。返回每个批次的编号数组，批次内按编号升序排列，批次之间按执行先后排列。'
      + '如果存在循环依赖，导致有任务永远无法执行，返回空数组 []。',
    entry: 'planBatches',
    signature: 'export function planBatches(n: number, deps: number[][]): number[][]',
    starter: [
      '// 思路提示：一个任务只有在它所有前置任务都完成后才能执行。',
      '// 先算出每个任务还差几个前置（入度），入度为 0 的任务就是第一批。',
      '// 一批执行完后，把它所有后继任务的入度减 1，减到 0 的进入下一批。',
      '// 别忘了检查是否有任务始终进不了批次（说明依赖成环）。',
      'export function planBatches(n: number, deps: number[][]): number[][] {',
      '  // TODO: 在这里写你的实现',
      '  return []',
      '}',
    ].join('\n'),
    solution: `export function planBatches(n: number, deps: number[][]): number[][] {
  const indegree: number[] = []
  const children: number[][] = []
  for (let i = 0; i < n; i++) {
    indegree.push(0)
    children.push([])
  }
  for (let i = 0; i < n; i++) {
    for (const need of deps[i]) {
      children[need].push(i)
      indegree[i] += 1
    }
  }
  let ready: number[] = []
  for (let i = 0; i < n; i++) {
    if (indegree[i] === 0) ready.push(i)
  }
  ready.sort((a, b) => a - b)
  const batches: number[][] = []
  let scheduled = 0
  while (ready.length > 0) {
    batches.push(ready)
    const next: number[] = []
    for (const task of ready) {
      scheduled += 1
      for (const child of children[task]) {
        indegree[child] -= 1
        if (indegree[child] === 0) next.push(child)
      }
    }
    next.sort((a, b) => a - b)
    ready = next
  }
  return scheduled === n ? batches : []
}`,
    tests: [
      { name: '示例 1：两个任务没有前置', args: [3, [[], [0], []]], expected: [[0, 2], [1]], public: true },
      { name: '示例 2：一条依赖链', args: [4, [[1], [2], [3], []]], expected: [[3], [2], [1], [0]], public: true },
      { name: '示例 3：互不依赖可以一次跑完', args: [3, [[], [], []]], expected: [[0, 1, 2]], public: true },
      { name: '边界：只有一个任务', args: [1, [[]]], expected: [[0]] },
      { name: '边界：两个任务互相依赖成环', args: [2, [[1], [0]]], expected: [] },
      { name: '边界：任务依赖自己', args: [3, [[], [1], [1]]], expected: [] },
      { name: '菱形依赖：两条支路汇合', args: [4, [[], [0], [0], [1, 2]]], expected: [[0], [1, 2], [3]] },
      { name: '分批汇合：批内编号升序', args: [5, [[], [0], [1], [0], [2, 3]]], expected: [[0], [1, 3], [2], [4]] },
      { name: '四层调度：多个起点与汇合点', args: [6, [[], [0], [0], [1, 2], [3], [3]]], expected: [[0], [1, 2], [3], [4, 5]] },
      { name: '孤立任务混在依赖链里', args: [5, [[1], [2], [], [4], []]], expected: [[2, 4], [1, 3], [0]] },
    ],
    examples: [
      {
        input: 'n = 3, deps = [[], [0], []]',
        output: '[[0, 2], [1]]',
        explain: '任务 0 和 2 没有前置，第一批一起派发；任务 1 要等 0 完成，放进第二批。',
      },
      {
        input: 'n = 4, deps = [[1], [2], [3], []]',
        output: '[[3], [2], [1], [0]]',
        explain: '这是一条依赖链，每个批次只能派发一个子代理，一共四批。',
      },
      {
        input: 'n = 2, deps = [[1], [0]]',
        output: '[]',
        explain: '两个任务互相等待，形成环，任何批次都装不进它们，所以返回空数组。',
      },
    ],
    constraints: [
      '1 <= n <= 200',
      'deps.length === n，deps[i] 中的编号互不重复，且不等于 i',
      '0 <= deps[i].length <= n - 1',
      'deps[i] 中的编号都落在 [0, n - 1] 内',
    ],
    hints: [
      '同一批次里的任务必须互不依赖，也就是它们的前置都已经在更早的批次里完成了。先问自己：第一批到底能放哪些任务？',
      '每个任务都盯着「自己还差几个前置没完成」。当这个缺口降到 0，它就随时可以进下一批。那么一批执行完之后，该怎么更新剩下的任务？',
      '用一个数组 indegree 记录每个任务还缺几个前置，再用一个邻接表记录「谁在等我」。'
      + '把 indegree 为 0 的任务收进当前批次并升序排序，然后遍历批次里每个任务的后继，把它们的 indegree 减 1，减到 0 的进入下一批。'
      + '最后比较已进入批次的任务数与 n，不相等就说明有环，返回空数组。',
    ],
    knowledge: [
      'TypeScript：用 number[][] 表示「每个任务各自的依赖列表」这种嵌套数组',
      '算法：拓扑排序 + 分层 BFS（LeetCode 210 课程表 II 的变体）',
      'Agent：为什么子代理调度要先按依赖分层，而不是把任务一次性全部并行派发',
    ],
  },
  {
    id: 'skill-cache-lru',
    title: 'Skill 缓存 LRU 淘汰序列',
    difficulty: 'medium',
    theme: 'skill',
    algorithms: ['哈希表', '双向链表', '模拟'],
    story:
      'Agent 每次调用 Skill 都要重新读一遍说明书，既慢又浪费上下文。于是运行时把最近用过的 Skill 放进一个固定容量的缓存池；'
      + '池子满了，就淘汰最久没被用过的那个。你需要算出这串缓存操作会返回什么结果。',
    task:
      '实现 runLru：operations 是一串操作，每项要么是 ["get", key]，要么是 ["put", key, value]；'
      + 'key 是字符串，value 是 1 到 1000 的数字字符串。缓存容量为 capacity。'
      + 'get 命中时返回 key 对应的数字，并把它标记为「最近使用」；未命中返回 -1。'
      + 'put 写入或更新 key 的值，同样标记为「最近使用」；如果写入后缓存里的 key 数量超过 capacity，就淘汰最久未使用的那个 key。'
      + '请按顺序处理全部操作，把每次 get 的结果依次收集成数组返回，put 不产生输出。capacity 可以为 0。',
    entry: 'runLru',
    signature: 'export function runLru(operations: string[][], capacity: number): number[]',
    starter: [
      '// 思路提示：get 命中要返回值，并把这个 key 标记成「最近使用」。',
      '// put 写入或更新后也要标记成「最近使用」；超出容量时淘汰最久未用的那个 key。',
      '// 先想清楚：什么结构既能按 key 快速查值，又能维护「最近使用」的先后顺序？',
      'export function runLru(operations: string[][], capacity: number): number[] {',
      '  // TODO: 在这里写你的实现',
      '  return []',
      '}',
    ].join('\n'),
    solution: `export function runLru(operations: string[][], capacity: number): number[] {
  const cache = new Map<string, number>()
  const answers: number[] = []
  for (const operation of operations) {
    const kind = operation[0]
    const key = operation[1]
    if (kind === 'get') {
      const value = cache.get(key)
      if (value === undefined) {
        answers.push(-1)
        continue
      }
      cache.delete(key)
      cache.set(key, value)
      answers.push(value)
      continue
    }
    const value = Number(operation[2])
    cache.delete(key)
    cache.set(key, value)
    if (cache.size > capacity) {
      for (const oldest of cache.keys()) {
        cache.delete(oldest)
        break
      }
    }
  }
  return answers
}`,
    tests: [
      {
        name: '示例 1：容量 2 的淘汰',
        args: [[['put', 'a', '1'], ['put', 'b', '2'], ['get', 'a'], ['put', 'c', '3'], ['get', 'b'], ['get', 'c']], 2],
        expected: [1, -1, 3],
        public: true,
      },
      {
        name: '示例 2：更新已有 key 会刷新顺序',
        args: [
          [['put', 'a', '1'], ['put', 'a', '2'], ['get', 'a'], ['put', 'b', '3'], ['put', 'c', '4'], ['get', 'a'], ['get', 'b'], ['get', 'c']],
          2,
        ],
        expected: [2, -1, 3, 4],
        public: true,
      },
      {
        name: '示例 3：容量只有 1',
        args: [[['put', 'a', '1'], ['put', 'b', '2'], ['get', 'a'], ['get', 'b']], 1],
        expected: [-1, 2],
        public: true,
      },
      {
        name: '边界：只有 put，没有 get',
        args: [[['put', 'a', '1'], ['put', 'b', '2']], 2],
        expected: [],
      },
      {
        name: '边界：没有任何操作',
        args: [[], 3],
        expected: [],
      },
      {
        name: '边界：容量为 0，什么都存不下',
        args: [[['put', 'a', '1'], ['get', 'a'], ['put', 'b', '2'], ['get', 'b']], 0],
        expected: [-1, -1],
      },
      {
        name: '连续 get 同一个 key 不改变淘汰顺序',
        args: [
          [['put', 'a', '1'], ['put', 'b', '2'], ['get', 'a'], ['get', 'a'], ['put', 'c', '3'], ['get', 'b'], ['get', 'a']],
          2,
        ],
        expected: [1, 1, -1, 1],
      },
      {
        name: 'get 未命中的 key 不影响顺序',
        args: [[['put', 'a', '1'], ['put', 'b', '2'], ['get', 'x'], ['put', 'c', '3'], ['get', 'a'], ['get', 'b']], 2],
        expected: [-1, -1, 2],
      },
      {
        name: '较长操作序列',
        args: [
          [
            ['put', 'a', '1'], ['put', 'b', '2'], ['put', 'c', '3'], ['get', 'a'], ['put', 'd', '4'],
            ['get', 'b'], ['get', 'c'], ['get', 'd'], ['put', 'e', '5'], ['get', 'a'], ['get', 'e'],
          ],
          3,
        ],
        expected: [1, -1, 3, 4, -1, 5],
      },
      {
        name: '重复覆盖同一个 key 后再淘汰',
        args: [[['put', 'a', '1'], ['put', 'b', '2'], ['put', 'a', '3'], ['put', 'c', '4'], ['get', 'b'], ['get', 'a'], ['get', 'c']], 2],
        expected: [-1, 3, 4],
      },
    ],
    examples: [
      {
        input: 'capacity = 2, operations = [["put","a","1"],["put","b","2"],["get","a"],["put","c","3"],["get","b"],["get","c"]]',
        output: '[1, -1, 3]',
        explain: 'get a 之后 a 变成最近使用，放入 c 时被淘汰的是最久未用的 b，所以 get b 返回 -1。',
      },
      {
        input: 'capacity = 1, operations = [["put","a","1"],["put","b","2"],["get","a"],["get","b"]]',
        output: '[-1, 2]',
        explain: '容量只有 1，写入 b 时必须先把 a 淘汰掉，所以 get a 返回 -1。',
      },
    ],
    constraints: [
      '0 <= capacity <= 100',
      '0 <= operations.length <= 300',
      'operations[i] 是 ["get", key] 或 ["put", key, value]',
      'key 由小写字母组成，长度 1~10；value 是 1~1000 的整数字符串',
    ],
    hints: [
      '缓存满了要淘汰「最久没被使用」的那个 key。注意「使用」既包括 get 命中，也包括 put 写入。先想清楚：怎么随时知道谁最近被用过、谁最久没被用过？',
      '如果每次用到某个 key 就把它挪到「最近使用」的一端，那么另一端自然就是该淘汰的那个。问题是：用什么结构能同时做到快速查值、又能快速挪动这个顺序？',
      '用哈希表保存 key 到 value 的映射，再用一条双向链表串起所有 key：头部是最近使用，尾部是最久未用。'
      + 'get 命中就把对应节点摘下来挂到头部；put 先新建或更新节点再挂到头部；超出容量就删掉尾节点，并从哈希表里移除它。'
      + '手写链表比较繁琐，也可以想一想：JS 的 Map 在「先 delete 再 set」之后，遍历顺序会变成什么样。',
    ],
    knowledge: [
      'TypeScript：用 Map<string, number> 表达 key 到值的映射，并说明它为什么能替代手写哈希表',
      '算法：哈希表 + 双向链表实现 O(1) 的 LRU 淘汰（LeetCode 146 LRU 缓存）',
      'Agent：为什么要给 Skill 缓存设容量上限，而不是把所有用过的 Skill 一直留在上下文里',
    ],
  },
  {
    id: 'skill-name-topk',
    title: 'Skill 名称模糊匹配 Top-K',
    difficulty: 'medium',
    theme: 'skill',
    algorithms: ['动态规划', '编辑距离', '排序'],
    story:
      '用户想用一个 Skill，但只记得个大概的名字，还可能拼错一两个字母。'
      + 'Agent 需要从已注册的 Skill 名字里挑出最接近的几个候选，交给模型确认，而不是硬猜一个名字去调用。',
    task:
      '实现 topSimilar：给定用户输入 query、已注册的 Skill 名字数组 names 和需要返回的个数 k。'
      + '两个字符串的编辑距离是：把其中一个变成另一个，最少需要多少次插入、删除或替换单个字符。'
      + '请按编辑距离从小到大挑出最接近 query 的 k 个名字；距离相同时，按名字的字典序（逐字符比较，字符小的排前面）升序排列。'
      + '返回挑出的名字数组，顺序就是这个排序结果。k 大于 names 长度时返回全部，k 为 0 或 names 为空时返回 []。',
    entry: 'topSimilar',
    signature: 'export function topSimilar(query: string, names: string[], k: number): string[]',
    starter: [
      '// 思路提示：先把「像不像」量化成两个名字之间的最少字符操作数，也就是编辑距离。',
      '// 再按「距离小的在前、距离相同按名字字典序」排序，最后取前 k 个。',
      '// 想一想：query 前 i 个字符和 name 前 j 个字符的答案，能不能由更短前缀的答案推出来？',
      'export function topSimilar(query: string, names: string[], k: number): string[] {',
      '  // TODO: 在这里写你的实现',
      '  return []',
      '}',
    ].join('\n'),
    solution: `export function topSimilar(query: string, names: string[], k: number): string[] {
  function distance(a: string, b: string): number {
    let previous: number[] = []
    for (let j = 0; j <= b.length; j++) previous.push(j)
    for (let i = 1; i <= a.length; i++) {
      const current: number[] = [i]
      for (let j = 1; j <= b.length; j++) {
        const replace = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        current.push(Math.min(previous[j] + 1, current[j - 1] + 1, replace))
      }
      previous = current
    }
    return previous[b.length]
  }
  const scored = names.map((name) => ({ name, steps: distance(query, name) }))
  scored.sort((left, right) => {
    if (left.steps !== right.steps) return left.steps - right.steps
    if (left.name < right.name) return -1
    if (left.name > right.name) return 1
    return 0
  })
  const limit = k < scored.length ? k : scored.length
  const picked: string[] = []
  for (let i = 0; i < limit; i++) picked.push(scored[i].name)
  return picked
}`,
    tests: [
      {
        name: '示例 1：拼错一个字母',
        args: ['web-serch', ['web-search', 'web-fetch', 'run-shell'], 2],
        expected: ['web-search', 'web-fetch'],
        public: true,
      },
      {
        name: '示例 2：完全相同的名字排第一',
        args: ['read-file', ['write-file', 'read-file', 'read-files'], 1],
        expected: ['read-file'],
        public: true,
      },
      {
        name: '示例 3：k 超过候选数量时返回全部',
        args: ['abc', ['abd', 'ab'], 5],
        expected: ['ab', 'abd'],
        public: true,
      },
      {
        name: '边界：k 为 0',
        args: ['read', ['read-file'], 0],
        expected: [],
      },
      {
        name: '边界：names 为空',
        args: ['anything', [], 2],
        expected: [],
      },
      {
        name: '距离相同按名字字典序排列',
        args: ['cat', ['bat', 'rat', 'hat', 'aat'], 4],
        expected: ['aat', 'bat', 'hat', 'rat'],
      },
      {
        name: '边界：query 是空字符串',
        args: ['', ['a', 'bb'], 1],
        expected: ['a'],
      },
      {
        name: '插入与删除的取舍',
        args: ['grep', ['grep', 'grap', 'grp', 'g'], 3],
        expected: ['grep', 'grap', 'grp'],
      },
      {
        name: '短前缀差异也能排进前三',
        args: ['read-file', ['write-file', 'web-search', 'read-file', 'read-files'], 3],
        expected: ['read-file', 'read-files', 'write-file'],
      },
      {
        name: '一个字符之差的大并列',
        args: ['shell', ['shell', 'sell', 'hell', 'shel', 'shll'], 5],
        expected: ['shell', 'hell', 'sell', 'shel', 'shll'],
      },
    ],
    examples: [
      {
        input: 'query = "web-serch", names = ["web-search", "web-fetch", "run-shell"], k = 2',
        output: '["web-search", "web-fetch"]',
        explain: 'web-serch 改成 web-search 只差一个字母，距离 1；改成 web-fetch 要替换两个字母，距离 2。',
      },
      {
        input: 'query = "read-file", names = ["write-file", "read-file", "read-files"], k = 1',
        output: '["read-file"]',
        explain: '完全相同的名字距离为 0，一定排在最前面。',
      },
    ],
    constraints: [
      '0 <= query.length <= 20',
      '0 <= names.length <= 200',
      '0 <= k <= names.length',
      'names[i] 只由小写字母和连字符组成，长度不超过 20，且互不重复',
    ],
    hints: [
      '先把「像不像」变成一个可以比较大小的数字：两个名字之间最少要做多少次字符操作。然后才是排序和截取。先想清楚：这个数字怎么定义，怎么算出来？',
      '要算两个前缀之间的最少操作数，能不能用更短前缀的答案推出来？想一想：query 的前 i 个字符和 name 的前 j 个字符，它们的最少操作数，和 i-1、j-1 处的答案是什么关系？',
      '用二维 DP：dp[i][j] 表示 query 前 i 个字符变成 name 前 j 个字符的最少操作数，边界是 dp[0][j] = j、dp[i][0] = i，'
      + '转移时取「删除一个字符」「插入一个字符」「替换一个字符」三种情况的最小值（字符相同时替换的代价为 0）。'
      + '每一行只依赖上一行，所以可以用两个一维数组滚动保存。算完所有名字的距离后，按「距离升序、距离相同按名字升序」排序，再取前 k 个。',
    ],
    knowledge: [
      'TypeScript：在函数内部再声明一个小函数（闭包），把编辑距离的计算单独收在一起',
      '算法：动态规划求编辑距离（LeetCode 72 编辑距离），再排序取 Top-K',
      'Agent：为什么 Skill 检索要返回若干候选交给模型确认，而不是直接猜一个名字去调用',
    ],
  },
]
