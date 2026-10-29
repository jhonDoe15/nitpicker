import { isConcatenation } from '../analysis/static-shapes.mjs';

const DECODERS = new Set(['atob', 'from', 'decode']);
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);

function literalText(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? '';
  }
  return undefined;
}

function concatenationLeaves(start) {
  const leaves = [];
  const pending = [start];
  for (const node of pending) {
    if (isConcatenation(node)) {
      pending.push(node.left, node.right);
    } else {
      leaves.push(node);
    }
  }
  return leaves.sort((a, b) => a.range[0] - b.range[0]);
}

function unwrapped(start) {
  const chain = [start];
  for (const node of chain) {
    if (WRAPPERS.has(node?.type)) {
      chain.push(node.expression);
    }
    const callee = node?.type === 'CallExpression' ? node.callee : undefined;
    const name = callee?.type === 'MemberExpression' ? callee.property.name : callee?.name;
    if (DECODERS.has(name) && node.arguments.length > 0) {
      chain.push(node.arguments[0]);
    }
    if (name === 'toString' && callee.type === 'MemberExpression') {
      chain.push(callee.object);
    }
  }
  return chain.at(-1);
}

export function staticString(start) {
  const node = unwrapped(start);
  if (node?.type !== 'BinaryExpression') {
    return literalText(node);
  }
  const parts = concatenationLeaves(node).map((leaf) => literalText(unwrapped(leaf)));
  return parts.includes(undefined) ? undefined : parts.join('');
}
