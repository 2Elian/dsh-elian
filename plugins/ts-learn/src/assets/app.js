/**
 * ts-learn challenge page.
 *
 * Three parts, in order: a small TypeScript syntax highlighter, the editor
 * controller that keeps a transparent textarea and a highlighted <pre> in
 * lockstep, and the API/render layer. No inline script and no inline handler
 * attributes, so the page runs under the strict CSP the host sends with it.
 *
 * The learner is assumed to be new to TypeScript: every message explains what
 * happened and what to do next, and the answer is never revealed before they
 * have tried three times.
 */

/* ── syntax highlighting ───────────────────────────────────────────────────
   Sticky regexes, tried in order at each position, so one pass over the source
   colours the whole file. Escaping happens per token, after matching, which is
   why the rules run against raw text rather than HTML-escaped text. */

const RULES = [
  ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
  ['string', /`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/y],
  ['number', /0[xX][0-9a-fA-F_]+n?|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?n?/y],
  [
    'keyword',
    /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|default|break|continue|new|class|extends|super|this|try|catch|finally|throw|async|await|yield|export|import|from|as|in|of|instanceof|typeof|void|delete|interface|type|enum|namespace|declare|readonly|public|private|protected|static|abstract|implements|satisfies|keyof|infer|is|true|false|null|undefined)\b/y,
  ],
  ['type', /\b(?:number|string|boolean|any|unknown|never|object|symbol|bigint|Array|Map|Set|Record|Promise|Partial|Readonly)\b/y],
  ['punct', /[{}()[\].,;:?<>+\-*/%=!&|^~]+/y],
  ['ident', /[A-Za-z_$][A-Za-z0-9_$]*/y],
  ['space', /\s+/y],
];

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/**
 * Escape the three characters that would otherwise become markup.
 * @param {string} text - raw text.
 * @returns {string} escaped text.
 */
function escapeHtml(text) {
  return text.replace(/[&<>]/g, (char) => ENTITIES[char]);
}

/**
 * Render one line number column.
 * @param {number} count - number of lines.
 * @returns {string} newline-separated numbers.
 */
function lineNumbers(count) {
  const numbers = new Array(count);
  for (let index = 0; index < count; index += 1) numbers[index] = String(index + 1);
  return numbers.join('\n');
}

/**
 * Colour one complete source file.
 * @param {string} source - the learner's code.
 * @returns {string} HTML with `tok-*` spans.
 */
function highlight(source) {
  let html = '';
  let index = 0;
  while (index < source.length) {
    let matched = false;
    for (const [kind, pattern] of RULES) {
      pattern.lastIndex = index;
      const match = pattern.exec(source);
      if (match === null || match[0].length === 0) continue;
      let className = kind;
      if (kind === 'ident') {
        // A name followed by `(` reads as a call; a capitalised name reads as a type.
        let ahead = index + match[0].length;
        while (ahead < source.length && (source[ahead] === ' ' || source[ahead] === '\t')) ahead += 1;
        if (source[ahead] === '(') className = 'func';
        else if (/^[A-Z]/.test(match[0])) className = 'type';
      }
      html += `<span class="tok-${className}">${escapeHtml(match[0])}</span>`;
      index += match[0].length;
      matched = true;
      break;
    }
    if (!matched) {
      html += escapeHtml(source[index]);
      index += 1;
    }
  }
  return html;
}

/* ── editor ────────────────────────────────────────────────────────────────
   A transparent textarea owns input, selection, undo and scrolling; the <pre>
   underneath owns colour. They share one metric block in CSS, and the <pre> is
   scrolled programmatically to follow the textarea. */

const INDENT = '  ';
const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const CLOSERS = new Set(Object.values(PAIRS));

const dom = {
  badges: document.getElementById('badges'),
  problem: document.getElementById('problem'),
  results: document.getElementById('results'),
  hintStrip: document.getElementById('hint-strip'),
  toast: document.getElementById('toast'),
  themeSelect: document.getElementById('theme-select'),
  next: document.getElementById('btn-next'),
  hint: document.getElementById('btn-hint'),
  run: document.getElementById('btn-run'),
  submit: document.getElementById('btn-submit'),
  textarea: document.getElementById('code'),
  highlight: document.getElementById('highlight-code'),
  gutter: document.getElementById('gutter'),
  highlightPre: document.getElementById('highlight'),
};

const PREFIX = document.querySelector('meta[name="ts-learn-prefix"]')?.content ?? '';

/** Live page state. */
const state = {
  challengeId: null,
  challenge: null,
  busy: false,
  hintLevel: 0,
  reviewTimer: null,
  reviewPollingFor: null,
  codeKey: null,
};

/* ── editor mechanics ────────────────────────────────────────────────────── */

/** Redraw the highlight layer and the gutter from the textarea. */
function repaint() {
  const value = dom.textarea.value;
  dom.highlight.innerHTML = `${highlight(value)}\n`;
  dom.gutter.textContent = lineNumbers(value.split('\n').length);
}

/** Delete or insert text while preserving the browser's native undo stack. */
function insertText(text) {
  const { textarea } = dom;
  let inserted = false;
  if (typeof document.execCommand === 'function') {
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch {
      inserted = false;
    }
  }
  if (!inserted) {
    const { selectionStart, selectionEnd, value } = textarea;
    textarea.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    textarea.selectionStart = selectionStart + text.length;
    textarea.selectionEnd = textarea.selectionStart;
    repaint();
  }
  rememberCode();
}

/** Replace a range of the textarea, used by the multi-line indent operations. */
function replaceRange(from, to, text, caretFrom, caretTo) {
  const { textarea } = dom;
  textarea.value = textarea.value.slice(0, from) + text + textarea.value.slice(to);
  textarea.selectionStart = caretFrom;
  textarea.selectionEnd = caretTo ?? caretFrom;
  repaint();
  rememberCode();
}

/** The bounds of every line the current selection touches. */
function selectedLines() {
  const { selectionStart, selectionEnd, value } = dom.textarea;
  const start = value.lastIndexOf('\n', selectionStart - 1) + 1;
  let end = value.indexOf('\n', selectionEnd);
  if (end === -1) end = value.length;
  return { start, end };
}

/** Indent every selected line by one level. */
function indentSelection() {
  const { textarea } = dom;
  const { start, end } = selectedLines();
  const block = textarea.value.slice(start, end);
  const shifted = block.split('\n').map(line => INDENT + line).join('\n');
  const added = shifted.length - block.length;
  replaceRange(start, end, shifted, textarea.selectionStart + INDENT.length, textarea.selectionEnd + added);
}

/** Remove one indent level from every selected line that has one. */
function outdentSelection() {
  const { textarea } = dom;
  const { start, end } = selectedLines();
  const block = textarea.value.slice(start, end);
  let removedBeforeCaret = 0;
  let removedTotal = 0;
  const lines = block.split('\n').map((line, position) => {
    const match = /^[ \t]{1,2}/.exec(line);
    if (match === null) return line;
    removedTotal += match[0].length;
    const lineStart = block.split('\n').slice(0, position).join('\n').length + (position > 0 ? 1 : 0);
    if (start + lineStart < textarea.selectionStart) {
      removedBeforeCaret = Math.min(removedTotal, removedBeforeCaret + match[0].length);
    }
    return line.slice(match[0].length);
  }).join('\n');
  replaceRange(
    start,
    end,
    lines,
    textarea.selectionStart - removedBeforeCaret,
    textarea.selectionEnd - removedTotal,
  );
}

/** Auto-indent a new line, and expand an empty bracket pair into a block. */
function newline() {
  const { textarea } = dom;
  const { selectionStart, selectionEnd, value } = textarea;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const indent = /^[ \t]*/.exec(value.slice(lineStart, selectionStart))[0];
  const before = value[selectionStart - 1];
  const after = value[selectionEnd];

  if (before !== undefined && PAIRS[before] === after) {
    insertText(`\n${indent}${INDENT}\n${indent}`);
    const caret = textarea.selectionStart - (indent.length + 1);
    textarea.setSelectionRange(caret, caret);
    rememberCode();
    return;
  }

  const currentLine = value.slice(lineStart, selectionStart);
  const extra = /(?:[{[(:]\s*|=>\s*)$/.test(currentLine) ? INDENT : '';
  insertText(`\n${indent}${extra}`);
}

/** Handle every editing affordance the plain textarea does not provide. */
function onKeyDown(event) {
  const { textarea } = dom;

  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    if (event.shiftKey) void submitCode();
    else void runSample();
    return;
  }

  if (event.key === 'Tab') {
    event.preventDefault();
    if (event.shiftKey) outdentSelection();
    else if (textarea.selectionStart !== textarea.selectionEnd && textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).includes('\n')) {
      indentSelection();
    } else insertText(INDENT);
    return;
  }

  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    newline();
    return;
  }

  if (event.key === 'Backspace' && textarea.selectionStart === textarea.selectionEnd) {
    const at = textarea.selectionStart;
    const before = textarea.value[at - 1];
    const after = textarea.value[at];
    if (before !== undefined && PAIRS[before] === after) {
      event.preventDefault();
      replaceRange(at - 1, at + 1, '', at - 1);
    }
    return;
  }

  const typed = event.key;
  if (typed.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;

  const { selectionStart, selectionEnd, value } = textarea;
  const next = value[selectionStart] ?? '';
  const previous = value[selectionStart - 1] ?? '';
  const isQuote = typed === '"' || typed === "'" || typed === '`';

  // A closer already sitting under the caret is stepped over, never doubled.
  if (CLOSERS.has(typed) && next === typed && selectionStart === selectionEnd) {
    event.preventDefault();
    textarea.setSelectionRange(selectionStart + 1, selectionStart + 1);
    return;
  }

  if (typed === '}' && selectionStart === selectionEnd) {
    // Closing an indented block: drop one level before the brace lands.
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const beforeCaret = value.slice(lineStart, selectionStart);
    if (/^[ \t]+$/.test(beforeCaret) && beforeCaret.length >= INDENT.length) {
      event.preventDefault();
      const stripped = beforeCaret.slice(0, beforeCaret.length - INDENT.length);
      replaceRange(lineStart, selectionStart, stripped, lineStart + stripped.length);
      insertText('}');
      return;
    }
  }

  if (PAIRS[typed] === undefined) return;

  if (selectionStart !== selectionEnd) {
    event.preventDefault();
    const selected = value.slice(selectionStart, selectionEnd);
    replaceRange(selectionStart, selectionEnd, typed + selected + PAIRS[typed], selectionEnd + 2);
    return;
  }

  // A quote that closes a string must not open a new pair: typing one right
  // after a word character, after another quote, or before a closing quote
  // just inserts that single character.
  if (isQuote && (/[A-Za-z0-9_$]/.test(previous) || previous === typed || CLOSERS.has(next))) return;

  event.preventDefault();
  insertText(typed + PAIRS[typed]);
  textarea.setSelectionRange(textarea.selectionStart - 1, textarea.selectionStart - 1);
  rememberCode();
}

/** Keep the highlight layer and gutter aligned with the textarea's viewport. */
function syncScroll() {
  dom.highlightPre.scrollTop = dom.textarea.scrollTop;
  dom.highlightPre.scrollLeft = dom.textarea.scrollLeft;
  dom.gutter.style.transform = `translateY(${-dom.textarea.scrollTop}px)`;
}

/* ── persistence ─────────────────────────────────────────────────────────── */

/** Remember the current draft so a page refresh never loses work. */
function rememberCode() {
  if (state.codeKey === null) return;
  try {
    window.localStorage.setItem(state.codeKey, dom.textarea.value);
  } catch {
    // A private-mode or full storage quota only costs draft persistence.
  }
}

/** Read a remembered value, tolerating a disabled storage backend. */
function recall(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a remembered value, tolerating a disabled storage backend. */
function remember(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // See recall().
  }
}

/* ── transport ───────────────────────────────────────────────────────────── */

/**
 * Call one JSON endpoint.
 * @param {string} route - path after the configured prefix.
 * @param {object} [body] - request payload; omitted for a GET.
 * @param {string} [method] - HTTP method, defaulting to POST.
 * @returns {Promise<object>} the decoded response.
 * @throws {Error} when the server rejects the request.
 */
async function api(route, body, method = 'POST') {
  let response;
  try {
    response = await fetch(`${PREFIX}${route}`, method === 'GET'
      ? { method }
      : {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
  } catch (error) {
    throw new Error(`无法连接 ts-learn 服务（${error.message}）。确认 DSH 还在运行。`);
  }
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`服务返回了非 JSON 响应（HTTP ${response.status}）`);
  }
  if (!response.ok) throw new Error(data.error ?? `请求失败（HTTP ${response.status}）`);
  return data;
}

/* ── rendering ───────────────────────────────────────────────────────────── */

/** Show a transient message at the bottom of the page. */
let toastTimer = null;
function toast(message, milliseconds = 2600) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    dom.toast.hidden = true;
  }, milliseconds);
}

/** Toggle the busy state of the three action buttons. */
function setBusy(busy, activeButton) {
  state.busy = busy;
  for (const button of [dom.run, dom.submit, dom.hint, dom.next]) button.disabled = busy;
  if (activeButton !== undefined) activeButton.classList.toggle('btn-busy', busy);
}

/** Render the header badges for one problem. */
function renderBadges(problem, attempts) {
  const difficulty = { easy: '简单', medium: '中等', hard: '困难' }[problem.difficulty] ?? problem.difficulty;
  const parts = [
    `<span class="badge badge-difficulty">${escapeHtml(difficulty)}</span>`,
    `<span class="badge badge-theme">${escapeHtml(problem.themeLabel)}</span>`,
    ...problem.algorithms.map(algo => `<span class="badge badge-algo">${escapeHtml(algo)}</span>`),
  ];
  if (attempts > 0) parts.push(`<span class="badge">已提交 ${attempts} 次</span>`);
  dom.badges.innerHTML = parts.join('');
}

/** Render the left-hand problem panel. */
function renderProblem(problem) {
  const sections = [];

  sections.push(`<h2 class="problem-title">${escapeHtml(problem.title)}</h2>`);
  sections.push(`<p class="muted">${escapeHtml(problem.story)}</p>`);

  sections.push(`<div class="problem-section"><h3>任务</h3><p>${escapeHtml(problem.task)}</p></div>`);

  sections.push(`<div class="problem-section"><h3>函数签名</h3><div class="signature">${escapeHtml(problem.signature)}</div></div>`);

  sections.push('<div class="problem-section"><h3>示例</h3>');
  for (const example of problem.examples) {
    sections.push(
      '<div class="example">'
      + `<div class="io"><span class="io-label">输入：</span>${escapeHtml(example.input)}\n`
      + `<span class="io-label">输出：</span>${escapeHtml(example.output)}</div>`
      + `<div class="explain">${escapeHtml(example.explain)}</div>`
      + '</div>',
    );
  }
  sections.push('</div>');

  sections.push('<div class="problem-section"><h3>约束</h3><ul class="plain">');
  for (const constraint of problem.constraints) sections.push(`<li>${escapeHtml(constraint)}</li>`);
  sections.push('</ul></div>');

  sections.push('<div class="problem-section"><h3>这道题会练到</h3><div class="chips">');
  for (const item of problem.knowledge) sections.push(`<span class="chip">${escapeHtml(item)}</span>`);
  sections.push('</div></div>');

  sections.push(
    '<div class="problem-section"><h3>提示</h3>'
    + `<p class="muted">一共 ${problem.hintCount} 层提示。第一次没通过会自动给你第一层；也可以随时点上面的「要提示」。`
    + `隐藏用例 ${problem.hiddenCaseCount} 个，自测只跑 ${problem.sampleCases.length} 个样例用例。</p>`
    + '<div id="solution-slot"></div></div>',
  );

  dom.problem.innerHTML = sections.join('');
  renderSolutionSlot();
}

/** Offer the reference implementation once the learner has earned it. */
function renderSolutionSlot() {
  const slot = document.getElementById('solution-slot');
  if (slot === null) return;
  const attempts = state.challenge?.attempts ?? 0;
  if (attempts < 3) {
    slot.innerHTML = `<p class="muted">提交 3 次后可以在这里看参考实现（当前 ${attempts} 次）。</p>`;
    return;
  }
  slot.innerHTML = '<button type="button" class="btn btn-soft" id="btn-solution">看参考实现</button><div id="solution-body"></div>';
  document.getElementById('btn-solution').addEventListener('click', async () => {
    try {
      const data = await api('/api/solution', { c: state.challengeId });
      if (!data.available) {
        toast(data.reason);
        return;
      }
      document.getElementById('solution-body').innerHTML = `<pre>${escapeHtml(data.solution)}</pre>`;
      document.getElementById('btn-solution').disabled = true;
    } catch (error) {
      toast(error.message, 5000);
    }
  });
}

/** Render one run result into the right-hand panel. */
function renderResult(result, options) {
  const { scope, submission } = options;
  const parts = [];

  const allPassed = result.ok;
  const label = scope === 'sample' ? '自测' : '提交';
  parts.push(
    '<div class="summary-line">'
    + `<span class="pill ${allPassed ? 'pill-ok' : 'pill-bad'}">${allPassed ? '全部通过' : `${result.passed}/${result.total} 通过`}</span>`
    + `<span class="muted">${label} · 用时 ${result.elapsedMs}ms</span>`
    + (scope === 'sample' ? '<span class="muted">（自测只跑样例用例，不计入提交次数）</span>' : '')
    + '</div>',
  );

  if (result.compileError !== null) {
    parts.push(
      '<div class="alert alert-error"><strong>代码没能通过 Node 的解析</strong>'
      + '这通常是少了括号、引号没配对，或者关键字拼错了。下面是最原始的报错：'
      + `<pre>${escapeHtml(result.compileError)}</pre></div>`,
    );
  }

  if (result.entryMissing !== null) {
    parts.push(
      '<div class="alert alert-error"><strong>没有找到要导出的函数</strong>'
      + `判题程序调用的是 <code>${escapeHtml(result.entryMissing)}</code>，但你导出的名字不是它。`
      + '确认函数前面写了 <code>export</code>，并且名字和题目要求完全一致。</div>',
    );
  }

  if (result.timedOut) {
    parts.push(
      '<div class="alert alert-warn"><strong>运行超时</strong>'
      + '代码没有在限定时间内结束，最常见的原因是循环条件写错了导致死循环，或者算法复杂度太高。'
      + '先检查 while / for 的退出条件。</div>',
    );
  }

  if (result.cases.length > 0) {
    parts.push('<div class="case-list">');
    for (const item of result.cases) {
      const diff = item.passed || scope !== 'full'
        ? ''
        : [
          '<div class="diff">',
          item.expected === undefined ? '' : `<span class="k">期望：</span><span class="v-expected">${escapeHtml(item.expected)}</span>\n`,
          item.actual === undefined ? '' : `<span class="k">实际：</span><span class="v-actual">${escapeHtml(item.actual)}</span>`,
          '</div>',
        ].join('');
      const detail = item.passed ? '' : (item.error !== null && item.error !== undefined
        ? `<div class="diff">${escapeHtml(item.error)}</div>`
        : diff);
      parts.push(
        `<div class="case ${item.passed ? 'pass' : 'fail'}">`
        + `<span class="mark">${item.passed ? '✓' : '✗'}</span>`
        + '<div class="case-body">'
        + `<span class="case-name">${escapeHtml(item.name)}</span>${item.ms === null ? '' : `<span class="case-time">${item.ms}ms</span>`}`
        + detail
        + '</div></div>',
      );
    }
    parts.push('</div>');
  }

  if (result.learnerOutput !== '') {
    parts.push(`<div class="console-out">${escapeHtml(result.learnerOutput)}</div>`);
  }

  if (submission !== undefined && !allPassed) {
    parts.push(`<p class="muted" style="margin-top:12px">这次提交已记录（第 ${submission.attempts} 次）。页面上的提示会在第一次失败后自动出现。</p>`);
  }

  parts.push('<div id="review-slot"></div>');
  dom.results.innerHTML = parts.join('');
}

/** Render the reviewing agent's verdict. */
function renderReview(review) {
  const slot = document.getElementById('review-slot');
  if (slot === null) return;
  if (review === null || review === undefined) return;
  const accepted = review.verdict === 'accepted';
  const parts = [
    `<div class="review verdict-${accepted ? 'accepted' : 'needs_work'}">`,
    '<div class="review-head">'
    + `<span class="pill ${accepted ? 'pill-ok' : 'pill-warn'}">${accepted ? 'Agent：通过' : 'Agent：还需要改'}</span>`
    + '<span class="who">来自会话里的 agent</span>'
    + '</div>',
    `<div class="summary">${escapeHtml(review.summary)}</div>`,
  ];
  if (review.rootCause !== null) {
    parts.push(`<div class="block"><span class="label">最关键的问题</span>${escapeHtml(review.rootCause)}</div>`);
  }
  if (review.hints.length > 0) {
    parts.push('<div class="block"><span class="label">分步提示</span><ol>');
    for (const hint of review.hints) parts.push(`<li>${escapeHtml(hint)}</li>`);
    parts.push('</ol></div>');
  }
  if (review.nextStep !== null) {
    parts.push(`<div class="block"><span class="label">下一步</span>${escapeHtml(review.nextStep)}</div>`);
  }
  parts.push('</div>');
  slot.innerHTML = parts.join('');
}

/** Show that the agent is still working, with a way to give up waiting. */
function renderReviewPending(handedOff) {
  const slot = document.getElementById('review-slot');
  if (slot === null) return;
  slot.innerHTML = handedOff
    ? '<div class="review"><div class="review-head"><span class="spinner"></span>'
      + '<span class="who">Agent 正在沙箱里复跑你的代码并写点评…</span></div>'
      + '<div class="muted">点评写好后会自动出现在这里。你也可以回到 DSH 对话里看它的完整分析。</div></div>'
    : '<div class="alert alert-warn"><strong>这次没有转给 agent 点评</strong>'
      + '插件可能被配置成不自动评审，或者会话已经结束。上面是用例的实际判定结果。</div>';
}

/* ── actions ─────────────────────────────────────────────────────────────── */

/** Load one challenge into the page. */
function applyChallenge(challenge) {
  state.challenge = challenge;
  state.challengeId = challenge.id;
  state.hintLevel = 0;
  window.clearTimeout(state.reviewTimer);
  state.reviewPollingFor = null;

  const url = new URL(window.location.href);
  url.searchParams.set('c', challenge.id);
  window.history.replaceState(null, '', url.toString());
  remember('ts-learn:challenge', challenge.id);

  dom.hintStrip.hidden = true;
  dom.hintStrip.textContent = '';

  state.codeKey = `ts-learn:code:${challenge.id}`;
  const draft = recall(state.codeKey);
  dom.textarea.value = draft === null || draft.trim() === '' ? challenge.problem.starter : draft;
  repaint();
  syncScroll();

  renderBadges(challenge.problem, challenge.attempts);
  renderProblem(challenge.problem);

  if (challenge.latest === null) {
    dom.results.innerHTML = '<p class="muted">写完后点「运行自测」用样例用例检查，点「提交」由会话里的 agent 判题并点评。</p>';
  } else {
    renderResult(challenge.latest.run, { scope: 'full', submission: { attempts: challenge.attempts } });
    if (challenge.latest.review === null) renderReviewPending(true);
    else renderReview(challenge.latest.review);
  }
}

/** Show the "no active challenge" screen. */
function renderEmpty(message) {
  dom.badges.innerHTML = '';
  dom.problem.innerHTML = `
    <div class="empty">
      <h2>还没有进行中的题目</h2>
      <p class="muted">${escapeHtml(message ?? '回到 DSH 的对话框，发送一次下面的命令：')}</p>
      <p class="cmd">/ts-learn</p>
      <p class="muted">插件会随机给你出一道 Agent 开发方向的 TypeScript 题，并自动打开这个页面。</p>
    </div>`;
  dom.results.innerHTML = '<p class="muted">题目载入后这里会显示自测与判题结果。</p>';
}

/** Run the sample cases. */
async function runSample() {
  if (state.busy || state.challengeId === null) return;
  setBusy(true, dom.run);
  verifyHighlightRegion();
  try {
    const data = await api('/api/run', { c: state.challengeId, code: dom.textarea.value });
    renderResult(data.result, { scope: 'sample' });
    if (data.result.ok) toast('样例用例全部通过，可以点「提交」了');
    else toast('还有样例用例没通过，看看下面的对比');
  } catch (error) {
    toast(error.message, 6000);
  } finally {
    setBusy(false, dom.run);
  }
}

/** Submit for judging. */
async function submitCode() {
  if (state.busy || state.challengeId === null) return;
  setBusy(true, dom.submit);
  try {
    const data = await api('/api/submit', { c: state.challengeId, code: dom.textarea.value });
    state.challenge.attempts = data.attempts;
    renderBadges(state.challenge.problem, data.attempts);
    renderResult(data.result, { scope: 'full', submission: { attempts: data.attempts } });
    renderSolutionSlot();
    renderReviewPending(data.handedOff);

    if (!data.result.ok) await showHintAfterFailure(data.attempts);
    else toast('全部隐藏用例通过！');

    if (data.handedOff) startReviewPolling(data.submissionId);
  } catch (error) {
    toast(error.message, 6000);
  } finally {
    setBusy(false, dom.submit);
  }
}

/** Reveal the next hint automatically after a failed submission. */
async function showHintAfterFailure(attempts) {
  const hintCount = state.challenge.problem.hintCount;
  const level = Math.min(hintCount, attempts);
  try {
    const data = await api('/api/hint', { c: state.challengeId, level });
    renderHint(data.hint);
  } catch {
    // A hint is a convenience; a failure to fetch one must not mask the result.
  }
}

/** Draw the hint strip. */
function renderHint(hint) {
  state.hintLevel = hint.level;
  dom.hintStrip.hidden = false;
  dom.hintStrip.innerHTML = `<div class="hint-head">提示 ${hint.level}/${hint.total}${hint.more ? ' · 还能更具体' : ' · 已是最后一层'}</div>${escapeHtml(hint.text)}`;
}

/** Ask for the next hint explicitly. */
async function requestHint() {
  if (state.busy || state.challengeId === null) return;
  setBusy(true, dom.hint);
  try {
    const data = await api('/api/hint', { c: state.challengeId, level: state.hintLevel + 1 });
    renderHint(data.hint);
  } catch (error) {
    toast(error.message, 5000);
  } finally {
    setBusy(false, dom.hint);
  }
}

/** Poll for the agent's review until it arrives or the wait budget runs out. */
function startReviewPolling(submissionId) {
  state.reviewPollingFor = submissionId;
  let attempts = 0;
  const tick = async () => {
    if (state.reviewPollingFor !== submissionId) return;
    attempts += 1;
    try {
      const data = await api('/api/review', { c: state.challengeId, s: submissionId });
      if (data.status === 'ready') {
        state.reviewPollingFor = null;
        renderReview(data.review);
        toast('Agent 的点评已经到了');
        return;
      }
    } catch {
      // Keep polling: a transient failure is not a reason to give up.
    }
    if (attempts >= 40) {
      const slot = document.getElementById('review-slot');
      if (slot !== null) {
        slot.innerHTML = '<div class="alert alert-info"><strong>还在等 agent 的点评</strong>'
          + '它可能正在沙箱里复跑你的代码。可以回 DSH 对话里查看，或者再点一次「提交」。</div>';
      }
      state.reviewPollingFor = null;
      return;
    }
    state.reviewTimer = window.setTimeout(tick, 2500);
  };
  state.reviewTimer = window.setTimeout(tick, 2500);
}

/** Start a round, optionally on a specific theme. */
async function startRound(theme) {
  if (state.challengeId === null) return;
  setBusy(true, dom.next);
  try {
    const data = await api('/api/new', { c: state.challengeId, theme });
    applyChallenge(data.challenge);
    const label = data.challenge.problem.themeLabel;
    toast(theme === undefined ? '换了一道新题' : `新题来自「${label}」`);
  } catch (error) {
    toast(error.message, 6000);
  } finally {
    setBusy(false, dom.next);
  }
}

/** Fill the theme chooser from the served theme list. */
function renderThemeOptions(themes) {
  const options = ['<option value="">随机</option>'];
  for (const theme of themes) {
    options.push(`<option value="${escapeHtml(theme.theme)}">${escapeHtml(theme.label)}</option>`);
  }
  dom.themeSelect.innerHTML = options.join('');
}

/** A cheap sanity check: the highlight layer must mirror the textarea length. */
function verifyHighlightRegion() {
  if (dom.highlight.textContent.length !== dom.textarea.value.length) repaint();
}

/* ── bootstrap ───────────────────────────────────────────────────────────── */

/** Wire the page and load the current round. */
async function main() {
  dom.textarea.addEventListener('input', () => {
    repaint();
    rememberCode();
  });
  dom.textarea.addEventListener('scroll', syncScroll);
  dom.textarea.addEventListener('keydown', onKeyDown);
  dom.run.addEventListener('click', () => void runSample());
  dom.submit.addEventListener('click', () => void submitCode());
  dom.hint.addEventListener('click', () => void requestHint());
  dom.next.addEventListener('click', () => void startRound());
  dom.themeSelect.addEventListener('change', () => {
    const theme = dom.themeSelect.value;
    dom.themeSelect.value = '';
    void startRound(theme === '' ? undefined : theme);
  });

  repaint();

  try {
    const health = await api('/api/health', undefined, 'GET');
    renderThemeOptions(health.themes ?? []);
  } catch {
    // The chooser is optional; the page still works without it.
  }

  const requested = new URL(window.location.href).searchParams.get('c') ?? recall('ts-learn:challenge');
  if (requested === null || requested === '') {
    renderEmpty();
    return;
  }

  try {
    const data = await api('/api/challenge', { c: requested });
    applyChallenge(data.challenge);
  } catch (error) {
    renderEmpty(error.message);
  }
}

void main();
