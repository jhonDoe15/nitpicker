import { foldTerm } from './terms.mjs';

const OPERATORS = new Set([
  '!',
  '-',
  '+',
  '~',
  'typeof',
  '*',
  '<',
  '<=',
  '>',
  '>=',
  '==',
  '!=',
  '===',
  '!==',
  '&',
  '|',
  '^',
  '<<',
  '>>',
  '>>>',
]);

const PURE_NAMESPACES = new Set(['Math', 'Character', 'StrictMath']);

const PURE_STATIC_CALLS = new Set([
  'Number.isNaN',
  'Number.isFinite',
  'Number.isInteger',
  'Number.isSafeInteger',
  'Double.isNaN',
  'Double.isFinite',
  'Double.isInfinite',
  'Float.isNaN',
  'Float.isFinite',
  'Float.isInfinite',
  'Integer.compare',
  'Long.compare',
  'Double.compare',
  'Boolean.compare',
  'Objects.isNull',
  'Objects.nonNull',
  'Objects.equals',
  'Array.isArray',
]);

const STRING_READS = new Set([
  'charAt',
  'charCodeAt',
  'codePointAt',
  'startsWith',
  'endsWith',
  'includes',
  'indexOf',
  'lastIndexOf',
  'isEmpty',
  'isBlank',
  'contains',
  'length',
]);

const LEAVES = new Set(['literal', 'name', 'this']);
const ALL_CHILDREN = new Set(['logical', 'conditional', 'index']);

export function isSideEffectFree(root) {
  return foldTerm(root, (node, children) => {
    if (LEAVES.has(node.kind)) {
      return true;
    }
    if (node.kind === 'unary' || node.kind === 'binary') {
      return OPERATORS.has(node.value) && children.every(Boolean);
    }
    if (ALL_CHILDREN.has(node.kind)) {
      return children.every(Boolean);
    }
    if (node.kind === 'member') {
      return children[0];
    }
    return node.kind === 'call' && children.every(Boolean) && isPureCallee(node.children[0]);
  });
}

export function cannotThrow(root) {
  return foldTerm(root, (node, children) => {
    if (LEAVES.has(node.kind)) {
      return true;
    }
    if (node.kind === 'unary' || node.kind === 'binary') {
      return OPERATORS.has(node.value) && children.every(Boolean);
    }
    return (node.kind === 'logical' || node.kind === 'conditional') && children.every(Boolean);
  });
}

function isPureCallee(callee) {
  if (callee.kind !== 'member') {
    return false;
  }
  const receiver = callee.children[0];
  if (receiver.kind === 'name' && PURE_NAMESPACES.has(receiver.value)) {
    return callee.value !== 'random';
  }
  if (receiver.kind === 'name' && PURE_STATIC_CALLS.has(`${receiver.value}.${callee.value}`)) {
    return true;
  }
  return STRING_READS.has(callee.value);
}
