import { GENERAL_HINT } from '../../rule-hints.mjs';

export const extraAccessibilityRuleNames = [
  'anchor-ambiguous-text',
  'control-has-associated-label',
  'no-aria-hidden-on-focusable',
  'prefer-tag-over-role',
];

export const accessibilityOptionOverrides = {
  'control-has-associated-label': [
    {
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
  ],
  'label-has-associated-control': [{ controlComponents: ['[A-Z]*'] }],
  'mouse-events-have-key-events': [
    {
      hoverInHandlers: ['onMouseOver', 'onMouseEnter'],
      hoverOutHandlers: ['onMouseOut', 'onMouseLeave'],
    },
  ],
};

const nativeButton =
  'Use `<button type="button" onClick={...}>`, which handles focus, Enter and Space';

export const accessibilityHints = {
  'anchor-ambiguous-text': ` Name the destination in the link text: \`<a href="/pricing">See pricing</a>\`.${GENERAL_HINT}`,
  'anchor-has-content': ` Put text in the link (\`<a href="/home">Home</a>\`), or set \`aria-label\` on an icon link.${GENERAL_HINT}`,
  'click-events-have-key-events': ` ${nativeButton}.${GENERAL_HINT}`,
  'control-has-associated-label': ` Give it visible text (\`<button>Close</button>\`) or \`aria-label="Close"\`; \`title\` is not a label.${GENERAL_HINT}`,
  'heading-has-content': ` Put text in the heading: \`<h2>Billing</h2>\`.${GENERAL_HINT}`,
  'img-redundant-alt': ` Describe what the image shows: \`alt="Team at the offsite"\`.${GENERAL_HINT}`,
  'label-has-associated-control': ` Wrap the field in the \`<label>\`, or point \`htmlFor\` at its \`id\`.${GENERAL_HINT}`,
  'no-access-key': ` Remove \`accessKey\`.${GENERAL_HINT}`,
  'no-aria-hidden-on-focusable': ` Remove \`aria-hidden\`, or take the element out of the tab order with \`tabIndex={-1}\`.${GENERAL_HINT}`,
  'no-autofocus': ` Move focus from the event that opens the view, through a ref (\`ref.current?.focus()\`).${GENERAL_HINT}`,
  'no-interactive-element-to-noninteractive-role': ` Use the element that has the role natively, or drop the \`role\`.${GENERAL_HINT}`,
  'no-noninteractive-element-interactions': ` Put the handler on a \`<button>\` or \`<a href>\` inside the element.${GENERAL_HINT}`,
  'no-noninteractive-element-to-interactive-role': ` Use the element that has the role natively: \`<button>\` for \`role="button"\`.${GENERAL_HINT}`,
  'no-noninteractive-tabindex': ` Remove \`tabIndex\`, or use an interactive element (\`<button>\`, \`<a href>\`).${GENERAL_HINT}`,
  'no-redundant-roles': ` Remove the \`role\` attribute.${GENERAL_HINT}`,
  'no-static-element-interactions': ` ${nativeButton}.${GENERAL_HINT}`,
  'prefer-tag-over-role': ` The native element brings its keyboard and focus behaviour; style it with \`className\`.${GENERAL_HINT}`,
  'tabindex-no-positive': ` Use \`tabIndex={0}\` and order the elements in the markup.${GENERAL_HINT}`,
};
