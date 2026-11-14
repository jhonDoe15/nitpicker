import { RULES_TOOL } from '../tool.mjs';
import { parseEffect } from '../effects/subject.mjs';

function details(subject) {
  const { path, fields } = parseEffect(subject);
  const [item = '<type>', field = '<flag>', via = field, share = 'most'] = fields;
  return { function: path[0], item, field, via, share };
}

function describe(subject) {
  const { function: name, item, field, via, share } = details(subject);
  return `\`${name}\` goes over a collection of \`${item}\` without skipping items flagged by \`${field}\`, which ${share} of the project's iterations over \`${item}\` do (\`${via}\`): deleted items take part in the result`;
}

function allowed(subject) {
  const { via } = details(subject);
  return `Skip the flagged items the way the other code does (\`${via}\`: a guard on the flag, the project's helper, or the narrowed type). Code that reads deleted items on purpose (undo, restore, trash, sync) belongs in an exception with that reason.`;
}

export const DELETED_ITEM_HINTS = [
  { tool: RULES_TOOL, rules: ['deleted-item-filter-missing'], describe, allowed },
];
