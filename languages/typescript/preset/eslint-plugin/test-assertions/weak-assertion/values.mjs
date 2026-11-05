import { memberName } from '../../rules/analysis/test-code-analysis.mjs';

const LENGTH_NAMES = new Set(['length', 'size']);

function unwrapChain(node) {
  return node?.type === 'ChainExpression' ? node.expression : node;
}

export function nullishName(node) {
  if (node?.type === 'Literal' && node.value === null && node.raw === 'null') {
    return 'null';
  }
  if (node?.type === 'Identifier' && node.name === 'undefined') {
    return 'undefined';
  }
  const isVoid = node?.type === 'UnaryExpression' && node.operator === 'void';
  return isVoid && node.argument.type === 'Literal' ? 'undefined' : undefined;
}

export function isNumber(node, expected) {
  return node?.type === 'Literal' && typeof node.value === 'number' && node.value === expected;
}

export function lengthName(node) {
  const member = unwrapChain(node);
  const name = member?.type === 'MemberExpression' ? memberName(member) : undefined;
  return LENGTH_NAMES.has(name) ? name : undefined;
}

export function isEmptyLiteral(node) {
  if (node?.type === 'ArrayExpression') {
    return node.elements.length === 0;
  }
  if (node?.type === 'Literal') {
    return node.value === '';
  }
  return (
    node?.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis[0].value.cooked === ''
  );
}

const ORDERED = new Map([
  ['>', { lengthOnLeft: true, bound: 0 }],
  ['<', { lengthOnLeft: false, bound: 0 }],
  ['>=', { lengthOnLeft: true, bound: 1 }],
  ['<=', { lengthOnLeft: false, bound: 1 }],
]);

const UNEQUAL = new Set(['!==', '!=']);

export function nonEmptyComparison(node) {
  if (node?.type !== 'BinaryExpression') {
    return undefined;
  }
  const ordered = ORDERED.get(node.operator);
  if (ordered) {
    const [subject, bound] = ordered.lengthOnLeft
      ? [node.left, node.right]
      : [node.right, node.left];
    return lengthName(subject) !== undefined && isNumber(bound, ordered.bound)
      ? { subject, bound }
      : undefined;
  }
  if (!UNEQUAL.has(node.operator)) {
    return undefined;
  }
  const [subject, bound] =
    lengthName(node.left) === undefined ? [node.right, node.left] : [node.left, node.right];
  return lengthName(subject) !== undefined && isNumber(bound, 0) ? { subject, bound } : undefined;
}

export function presenceComparison(node) {
  if (node?.type !== 'BinaryExpression' || !UNEQUAL.has(node.operator)) {
    return undefined;
  }
  const absent = nullishName(node.right) ?? nullishName(node.left);
  if (absent === undefined) {
    return undefined;
  }
  return { absent, subject: nullishName(node.right) === undefined ? node.right : node.left };
}
