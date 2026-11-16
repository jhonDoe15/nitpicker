import { pureCallKind } from '../../../logic/purity.mjs';
import { nodesOf } from '../../../near-duplicates/tree/nodes.mjs';

const READING = new Set(['name', 'literal', 'this', 'member', 'index', 'binary', 'conditional']);
const READING_UNARY = new Set(['!', '-', '+', '~', 'not', 'typeof']);
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

function readsOnly(call) {
  const [callee, ...args] = call.children;
  if (callee.kind === 'name') {
    return READING_FUNCTIONS.has(callee.text ?? callee.value);
  }
  if (callee.kind !== 'member') {
    return false;
  }
  return (
    pureCallKind(callee) !== undefined ||
    (args.length === 0 && (ACCESSOR.test(callee.value) || ACCESSORS.has(callee.value)))
  );
}

function isReading(node) {
  if (node.kind === 'unary') {
    return READING_UNARY.has(node.value);
  }
  if (node.kind === 'call') {
    return readsOnly(node);
  }
  return READING.has(node.kind);
}

/** Whether evaluating the condition only reads: no write, no allocation, no call that may change state. */
export function hasNoSideEffects(condition) {
  return nodesOf(condition).every(isReading);
}
