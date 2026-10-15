export const extraAccessibilityRuleNames = [
  'anchor-ambiguous-text',
  'control-has-associated-label',
  'no-aria-hidden-on-focusable',
  'prefer-tag-over-role',
];

export const accessibilityOptionOverrides = {
  'control-has-associated-label': {
    ignoreElements: ['audio', 'canvas', 'embed', 'input', 'select', 'textarea', 'tr', 'video'],
    ignoreRoles: [
      'grid',
      'listbox',
      'menu',
      'menubar',
      'radiogroup',
      'row',
      'tablist',
      'toolbar',
      'tree',
      'treegrid',
    ],
    includeRoles: ['alert', 'dialog'],
  },
  'label-has-associated-control': { controlComponents: ['[A-Z]*'] },
};
