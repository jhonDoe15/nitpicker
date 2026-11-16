import { RULES_TOOL } from '../tool.mts';
import { parseEffect } from '../effects/subject.mts';
import type { RuleHint } from '../hint-types.mts';

function details(subject: string) {
  const { path, fields } = parseEffect(subject);
  const [model = '<model>', field = '<column>', via = field, share = 'most'] = fields;
  const [name = '<function>'] = path;
  return { function: name, model, field, via, share };
}

function describe(subject: string): string {
  const { function: name, model, field, via, share } = details(subject);
  return `\`${name}\` reads \`${model}\` without the filter on \`${field}\` that ${share} of the project's \`${model}\` reads apply (\`${via}\`): deleted or hidden rows reach the caller`;
}

function allowed(subject: string): string {
  const { via } = details(subject);
  return `Apply the filter the other reads use (\`${via}\`) to this query. A query that reads deleted rows on purpose (trash, restore, purge, admin, cleanup) belongs in an exception with that reason.`;
}

export const SOFT_DELETE_HINTS: readonly RuleHint[] = [
  { tool: RULES_TOOL, rules: ['soft-delete-filter-missing'], describe, allowed },
];
