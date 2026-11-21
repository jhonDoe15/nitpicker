import { pureCallKind } from '../../../logic/purity.mts';
import { calleeTerm } from '../../../near-duplicates/tree/callee-term.mts';
import { nodesOf } from '../../../near-duplicates/tree/nodes.mts';
import type { TreeNode } from '../../../near-duplicates/tree/tree-types.mts';

const READING = new Set(['name', 'literal', 'this', 'member', 'index', 'binary', 'conditional']);
const READING_UNARY = new Set<string | undefined>(['!', '-', '+', '~', 'not', 'typeof']);
const ACCESSOR = /^(?:get|is|has|can)(?:[A-Z\d_]|$)/u;
const ACCESSORS = new Set([
  'size',
  'length',
  'count',
  'items',
  'keys',
  'values',
  'entries',
  'name',
  'id',
]);
const READING_FUNCTIONS = new Set(['len', 'isinstance', 'callable', 'bool', 'hasattr']);

function readsOnly(call: TreeNode): boolean {
  const [callee, ...args] = call.children;
  if (callee?.kind === 'name') {
    return READING_FUNCTIONS.has(callee.text ?? callee.value ?? '');
  }
  if (callee?.kind !== 'member') {
    return false;
  }
  const name = callee.value ?? '';
  return (
    pureCallKind(calleeTerm(callee)) !== undefined ||
    (args.length === 0 && (ACCESSOR.test(name) || ACCESSORS.has(name)))
  );
}

function isReading(node: TreeNode): boolean {
  if (node.kind === 'unary') {
    return READING_UNARY.has(node.value);
  }
  if (node.kind === 'call') {
    return readsOnly(node);
  }
  return READING.has(node.kind);
}

export function hasNoSideEffects(condition: TreeNode): boolean {
  return nodesOf(condition).every(isReading);
}
