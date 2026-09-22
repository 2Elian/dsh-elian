/**
 * Panel copy.
 *
 * Every user-visible string lives here and is registered with the client locale
 * service, so a deployment can retranslate the panel without touching code.
 */

/** Locale namespace this plugin registers. */
export const NS = 'sessionList'

export const zh = {
  'button.title': '本对话的提问列表',
  'panel.label': '提问列表',
  'panel.placeholder': '筛选提问…',
  'panel.turns': '个提问',
  'panel.empty': '本对话还没有提问',
  'panel.emptyFilter': '没有匹配的提问',
  'panel.more': '（还有更早的历史未加载）',
  'panel.complete': '（已覆盖全部历史）',
  'panel.close': '关闭',
  'panel.turn': '第',
  'panel.turnSuffix': '轮',
  'panel.answer': '回答',
  'panel.pending': '（未回答）',
  'panel.jumpFailed': '该提问在已加载范围之外，无法跳转',
}

/** Complete key set of the namespace. */
export type Key = keyof typeof zh

export const en: Record<Key, string> = {
  'button.title': 'Prompts in this conversation',
  'panel.label': 'Prompt outline',
  'panel.placeholder': 'Filter prompts…',
  'panel.turns': 'prompts',
  'panel.empty': 'No prompt yet in this conversation',
  'panel.emptyFilter': 'No prompt matches',
  'panel.more': '(older history not loaded)',
  'panel.complete': '(whole history covered)',
  'panel.close': 'Close',
  'panel.turn': 'Turn',
  'panel.turnSuffix': '',
  'panel.answer': 'Answer',
  'panel.pending': '(unanswered)',
  'panel.jumpFailed': 'That turn is outside the loaded range',
}
