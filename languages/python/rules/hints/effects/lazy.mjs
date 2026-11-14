import { RULES_TOOL } from '../tool.mjs';
import { parseEffect } from './subject.mjs';

const DJANGO_ADVICE =
  'Fetch it in the query: `select_related("customer")` for a foreign key or one-to-one field, `prefetch_related("items")` or `Prefetch(...)` for a reverse or many-to-many relation; or read only the columns you need with `values()`.';
const SQLALCHEMY_ADVICE =
  'Fetch it in the query: `.options(selectinload(Order.items))` (`joinedload` for a single related row), or declare `lazy="selectin"` on the relationship; or select only the columns you need.';

function describe(subject) {
  const { path, fields } = parseEffect(subject);
  const [model = ''] = path[0].split('.');
  const [, origin = 'the query', helper] = fields;
  const reader = helper
    ? `\`${helper}\` receives each item of the loop and reads its lazy relationship \`${path[0]}\``
    : `\`${path[0]}\` is a lazy relationship`;
  return `${reader}: \`${origin}\` fetches the \`${model}\` rows without it, so each item of the loop runs one more query`;
}

function allowed(subject) {
  return parseEffect(subject).fields[0] === 'sqlalchemy' ? SQLALCHEMY_ADVICE : DJANGO_ADVICE;
}

export const LAZY_HINTS = [
  { tool: RULES_TOOL, rules: ['lazy-relation-in-loop'], describe, allowed },
];
