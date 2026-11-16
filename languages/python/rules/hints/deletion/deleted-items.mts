import { RULES_TOOL } from '../tool.mts';
import { parseEffect } from '../effects/subject.mts';
import type { RuleHint } from '../hint-types.mts';

function details(subject: string) {
  const { path, fields } = parseEffect(subject);
  const [item = '<type>', field = '<flag>', via = field, share = 'most'] = fields;
  const [name = '<function>'] = path;
  return { function: name, item, field, via, share };
}

function describe(subject: string): string {
  const { function: name, item, field, via, share } = details(subject);
  return `\`${name}\` goes over a collection of \`${item}\` without skipping items flagged by \`${field}\`, which ${share} of the project's iterations over \`${item}\` do (\`${via}\`): deleted items take part in the result`;
}

function allowed(subject: string): string {
  const { via } = details(subject);
  return `Skip the flagged items the way the other code does (\`${via}\`: a guard on the flag, the project's helper, or the narrowed type). Code that reads deleted items on purpose (undo, restore, trash, sync) belongs in an exception with that reason.`;
}

export const DELETED_ITEM_HINTS: readonly RuleHint[] = [
  { tool: RULES_TOOL, rules: ['deleted-item-filter-missing'], describe, allowed },
];
