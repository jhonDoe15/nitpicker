import { DYNAMIC } from '../../../../../../shared/rules/security/sql-text.mjs';
import { sqlOrderGaps } from '../../../../../../shared/rules/queries/sql-order.mjs';
import { stringValue } from '../analysis/constant-resolution.mjs';
import { memberName, resolvedValue, unwrapped } from '../security/security-values.mjs';
import { sinkFor } from '../security/sql/sql-sinks.mjs';

const STATEMENT_START = /^\s*(?:\(\s*)?(?:select|with)\b/iu;
const SQL_TAGS = new Set(['sql', 'SQL']);
const RAW_TAGS = new Set(['$queryRaw', 'sql']);
const RAW_CALLS = new Set(['raw']);
const ORDER_WORDS = /\b(?:limit|offset|fetch|array_agg|jsonb?_agg)\b/iu;
const MAX_DEPTH = 4;
const EXPANSIONS = Array.from({ length: 2 * MAX_DEPTH + 2 });

function tagName(tag) {
  const target = unwrapped(tag);
  if (target.type === 'Identifier') {
    return SQL_TAGS.has(target.name) ? target.name : undefined;
  }
  const name = target.type === 'MemberExpression' ? memberName(target) : undefined;
  return RAW_TAGS.has(name) || SQL_TAGS.has(name) ? name : undefined;
}

function isSqlTemplate(node) {
  return node?.type === 'TaggedTemplateExpression' && tagName(node.tag) !== undefined;
}

function rawText(context, target) {
  const callee = target.type === 'CallExpression' ? unwrapped(target.callee) : undefined;
  const raw = callee?.type === 'MemberExpression' && RAW_CALLS.has(memberName(callee));
  const value = raw ? stringValue(resolvedValue(context, target.arguments[0])) : undefined;
  return value ?? stringValue(resolvedValue(context, target));
}

function expandPiece(context, piece) {
  if (typeof piece === 'string') {
    return [piece];
  }
  if (piece.template !== undefined) {
    return piece.template.quasis.flatMap((quasi, index) => {
      const value = piece.template.expressions[index];
      const cooked = quasi.value.cooked ?? '';
      return value === undefined ? [cooked] : [cooked, { value, depth: piece.depth }];
    });
  }
  const target = unwrapped(piece.value);
  if (isSqlTemplate(target)) {
    return piece.depth >= MAX_DEPTH
      ? [DYNAMIC]
      : [{ template: target.quasi, depth: piece.depth + 1 }];
  }
  return [rawText(context, target) ?? DYNAMIC];
}

function templateText(context, template) {
  const pieces = EXPANSIONS.reduce(
    (current) => current.flatMap((piece) => expandPiece(context, piece)),
    [{ template, depth: 0 }],
  );
  return pieces.map((piece) => (typeof piece === 'string' ? piece : DYNAMIC)).join('');
}

function isInsideSqlTemplate(node) {
  const parent = node.parent;
  return parent?.type === 'TemplateLiteral' && isSqlTemplate(parent.parent);
}

function consumedAsSql(context, node) {
  return sinkFor(context, node) !== undefined;
}

/**
 * The SQL text `node` holds, with `DYNAMIC` for each interpolated value, when `node` is SQL: a
 * `sql` tagged template, or a string or template that starts a SELECT or goes to a SQL sink.
 */
function sqlTextOf(context, node) {
  if (node.type === 'TaggedTemplateExpression') {
    return isSqlTemplate(node) && !isInsideSqlTemplate(node)
      ? templateText(context, node.quasi)
      : undefined;
  }
  if (node.parent?.type === 'TaggedTemplateExpression' || isInsideSqlTemplate(node)) {
    return undefined;
  }
  const text = node.type === 'TemplateLiteral' ? templateText(context, node) : stringValue(node);
  if (typeof text !== 'string' || !ORDER_WORDS.test(text)) {
    return undefined;
  }
  return STATEMENT_START.test(text) || consumedAsSql(context, node) ? text : undefined;
}

export function sqlGaps(context, node) {
  const text = sqlTextOf(context, node);
  return text === undefined ? [] : sqlOrderGaps(text);
}
