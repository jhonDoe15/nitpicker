import { RULES_TOOL } from '../tool.mjs';
import { parseEffect } from '../effects/subject.mjs';

function details(subject) {
  const { path, fields } = parseEffect(subject);
  const [model = '<model>', field = '<column>', via = field, share = 'most'] = fields;
  return { function: path[0], model, field, via, share };
}

function describe(subject) {
  const { function: name, model, field, via, share } = details(subject);
  return `\`${name}\` reads \`${model}\` without the filter on \`${field}\` that ${share} of the project's \`${model}\` reads apply (\`${via}\`): deleted or hidden rows reach the caller`;
}

function allowed(subject) {
  const { via } = details(subject);
  return `Apply the filter the other reads use (\`${via}\`) to this query. A query that reads deleted rows on purpose (trash, restore, purge, admin, cleanup) belongs in an exception with that reason.`;
}

export const SOFT_DELETE_HINTS = [
  { tool: RULES_TOOL, rules: ['soft-delete-filter-missing'], describe, allowed },
];
