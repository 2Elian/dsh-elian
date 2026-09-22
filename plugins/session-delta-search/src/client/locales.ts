/**
 * Panel copy.
 *
 * Every user-visible string lives here and is registered with the client locale
 * service, so a deployment can retranslate the panel without touching code.
 * Counts are rendered next to a label rather than interpolated into it, which
 * keeps the dictionary free of formatting rules.
 */

/** Locale namespace this plugin registers. */
export const NS = 'sessionDeltaSearch'

export const zh = {
  'button.title': '在本对话中搜索',
  'panel.label': '对话搜索',
  'panel.placeholder': '搜索本对话：提示词、回答、推理、工具调用与结果',
  'panel.results': '条结果',
  'panel.empty': '没有匹配的内容',
  'panel.emptyHint': '已搜索当前加载的对话内容。更早的历史需要先加载。',
  'panel.loading': '搜索中…',
  'panel.scope': '已索引',
  'panel.events': '条事件',
  'panel.more': '（还有更早的历史未加载）',
  'panel.complete': '（已覆盖全部历史）',
  'panel.loadAll': '加载全部历史',
  'panel.close': '关闭',
  'panel.prev': '上一个',
  'panel.next': '下一个',
  'panel.caseSensitive': '区分大小写',
  'panel.wholeWord': '全词匹配',
  'panel.filter': '范围',
  'panel.jump.newer': '该结果在已加载范围之外，无法跳转',
  'kind.user': '提问',
  'kind.assistant': '回答',
  'kind.reasoning': '推理',
  'kind.tool-call': '工具调用',
  'kind.tool-result': '工具结果',
  'kind.context': '注入',
  'kind.note': '记录',
}

/** Complete key set of the namespace. */
export type Key = keyof typeof zh

export const en: Record<Key, string> = {
  'button.title': 'Search this conversation',
  'panel.label': 'Conversation search',
  'panel.placeholder': 'Search prompts, answers, reasoning, tool calls and results',
  'panel.results': 'results',
  'panel.empty': 'No match',
  'panel.emptyHint': 'Searched the loaded part of this conversation. Older history must be loaded first.',
  'panel.loading': 'Searching…',
  'panel.scope': 'Indexed',
  'panel.events': 'events',
  'panel.more': '(older history not loaded)',
  'panel.complete': '(whole history covered)',
  'panel.loadAll': 'Load all history',
  'panel.close': 'Close',
  'panel.prev': 'Previous',
  'panel.next': 'Next',
  'panel.caseSensitive': 'Match case',
  'panel.wholeWord': 'Whole word',
  'panel.filter': 'Scope',
  'panel.jump.newer': 'That result is outside the loaded range',
  'kind.user': 'prompt',
  'kind.assistant': 'answer',
  'kind.reasoning': 'reasoning',
  'kind.tool-call': 'tool call',
  'kind.tool-result': 'tool result',
  'kind.context': 'injected',
  'kind.note': 'note',
}
