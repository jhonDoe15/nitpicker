import { isStableModel } from './models/models.mts';
import { foldTerm } from './terms.mts';
import type { Term } from './typed/term-types.mts';

const OPERATORS = new Set<string | undefined>([
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

const NEVER_THROWING = new Set<string | undefined>(['!', 'typeof', '===', '!==']);

const PURE_NAMESPACES = new Set<string | undefined>(['Math', 'Character', 'StrictMath']);

const FLOAT_TESTS = ['isNaN', 'isFinite', 'isInfinite'];
const COMPARE = new Set(['compare']);

const PURE_STATIC_CALLS = new Map<string, ReadonlySet<string>>([
  ['Number', new Set(['isNaN', 'isFinite', 'isInteger', 'isSafeInteger'])],
  ['Double', new Set([...FLOAT_TESTS, 'compare'])],
  ['Float', new Set(FLOAT_TESTS)],
  ['Integer', COMPARE],
  ['Long', COMPARE],
  ['Boolean', COMPARE],
  ['Objects', new Set(['isNull', 'nonNull', 'equals'])],
  ['Array', new Set(['isArray'])],
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
  'trim',
  'trimStart',
  'trimEnd',
  'strip',
  'toLowerCase',
  'toUpperCase',
  'isPresent',
  'contains',
  'length',
]);

const LEAVES = new Set(['literal', 'name', 'this']);
const ALL_CHILDREN = new Set(['logical', 'conditional', 'index', 'abs', 'cast']);

function foldBeyondLeaves(
  root: Term,
  rule: (node: Term, children: readonly boolean[]) => boolean,
): boolean {
  return foldTerm<boolean>(root, (node, children) => LEAVES.has(node.kind) || rule(node, children));
}

export function isSideEffectFree(root: Term): boolean {
  return foldBeyondLeaves(root, (node, children) => {
    if (node.kind === 'unary' || node.kind === 'binary') {
      return OPERATORS.has(node.value) && children.every(Boolean);
    }
    if (ALL_CHILDREN.has(node.kind)) {
      return children.every(Boolean);
    }
    if (node.kind === 'member') {
      return children[0] === true;
    }
    return (
      node.kind === 'call' &&
      children.every(Boolean) &&
      (isStableModel(node) || isPureCallee(node.children[0]))
    );
  });
}

export function cannotThrow(root: Term): boolean {
  return foldBeyondLeaves(root, (node, children) => {
    if (node.kind === 'unary' || node.kind === 'binary') {
      return NEVER_THROWING.has(node.value) && children.every(Boolean);
    }
    return (node.kind === 'logical' || node.kind === 'conditional') && children.every(Boolean);
  });
}

export function pureCallKind(callee: Term): 'static' | 'read' | undefined {
  if (callee.kind !== 'member') {
    return undefined;
  }
  const receiver = callee.children[0];
  if (receiver?.kind === 'name' && PURE_NAMESPACES.has(receiver.value)) {
    return callee.value === 'random' ? undefined : 'static';
  }
  if (
    receiver?.kind === 'name' &&
    PURE_STATIC_CALLS.get(String(receiver.value))?.has(String(callee.value)) === true
  ) {
    return 'static';
  }
  return callee.value !== undefined && STRING_READS.has(callee.value) ? 'read' : undefined;
}

function isPureCallee(callee: Term | undefined): boolean {
  return callee !== undefined && pureCallKind(callee) !== undefined;
}
