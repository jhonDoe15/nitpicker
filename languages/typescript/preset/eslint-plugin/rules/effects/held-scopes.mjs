import { ancestorsOf } from '../analysis/ancestry.mjs';
import { childrenOf } from '../loops/loop-shapes.mjs';
import { wordsOf } from '../support/identifier-words.mjs';
import { estreeCallView } from '../support/io/call-views.mjs';

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);
const CALL = 'CallExpression';
const RUN_EXCLUSIVE = 'runExclusive';
const ACQUIRE = 'acquire';
const TRANSACTION = 'transaction';
const LOCK_OWNERS = new Set(['lock', 'locks', 'mutex', 'semaphore', 'redlock']);
const SCOPES = {
  transaction: {
    callbacks: new Set(['$transaction', TRANSACTION, 'transactional']),
    begins: new Set(['startTransaction', 'beginTransaction', TRANSACTION]),
    ends: new Set(['commit', 'commitTransaction', 'rollback', 'rollbackTransaction']),
  },
  lock: {
    callbacks: new Set([RUN_EXCLUSIVE, ACQUIRE, 'request', 'using']),
    begins: new Set([ACQUIRE]),
    ends: new Set(['release', 'unlock', 'releaseLock']),
  },
};

function isFunction(node) {
  return FUNCTIONS.has(node?.type);
}

function hasCallback(call) {
  return call.arguments.some(isFunction);
}

function isLockReceiver(view) {
  return view.names.slice(0, -1).some((name) => LOCK_OWNERS.has(wordsOf(name).at(-1)));
}

function isOwned(kind, view) {
  return kind === TRANSACTION || view.method === RUN_EXCLUSIVE || isLockReceiver(view);
}

function isCallbackOpener(kind, call, fn) {
  if (call?.type !== CALL || !call.arguments.includes(fn)) {
    return false;
  }
  const view = estreeCallView(call);
  return SCOPES[kind].callbacks.has(view.method) && isOwned(kind, view);
}

function isMarker(kind, call, role) {
  const view = estreeCallView(call);
  const owned = role === 'ends' || isOwned(kind, view);
  return SCOPES[kind][role].has(view.method) && !hasCallback(call) && owned;
}

function runsWithCaller(node) {
  return !isFunction(node) || (node.parent.type === CALL && node.parent.arguments.includes(node));
}

function callsWithin(root, visitorKeys) {
  const calls = [];
  const pending = [root];
  for (const node of pending) {
    if (node.type === CALL || node.type === 'TaggedTemplateExpression') {
      calls.push(node);
    }
    pending.push(...childrenOf(node, visitorKeys).filter(runsWithCaller));
  }
  return calls.toSorted((left, right) => left.range[0] - right.range[0]);
}

function callbackScope(kind, node, visitorKeys) {
  const fn = ancestorsOf(node).find(
    (ancestor) => isFunction(ancestor) && isCallbackOpener(kind, ancestor.parent, ancestor),
  );
  return fn === undefined
    ? undefined
    : { opener: fn.parent, calls: callsWithin(fn.body, visitorKeys), param: fn.params[0] };
}

function rangeScope(kind, node, { calls }) {
  const before = calls.filter((call) => call.range[1] <= node.range[0]);
  const begin = before.findLast((call) => isMarker(kind, call, 'begins'));
  const lastEnd = before.findLast((call) => isMarker(kind, call, 'ends'));
  if (begin === undefined || (lastEnd !== undefined && lastEnd.range[0] > begin.range[0])) {
    return undefined;
  }
  const after = calls.filter((call) => call.range[0] >= begin.range[1]);
  const end = after.find((call) => isMarker(kind, call, 'ends'));
  const inside = after.filter((call) => end === undefined || call.range[1] <= end.range[0]);
  return { opener: begin, calls: inside, param: estreeCallView(begin).root };
}

export function heldScope(kind, node, { sourceCode, functionCalls }) {
  const { visitorKeys } = sourceCode;
  const callback = callbackScope(kind, node, visitorKeys);
  if (callback !== undefined) {
    return callback;
  }
  const fn = ancestorsOf(node).find(isFunction);
  const body = fn === undefined ? sourceCode.ast : fn.body;
  const calls = functionCalls.get(body) ?? callsWithin(body, visitorKeys);
  functionCalls.set(body, calls);
  return rangeScope(kind, node, { calls });
}

export function isOnParameter(call, param) {
  const { root } = estreeCallView(call);
  return param?.type === 'Identifier' && root?.name === param.name;
}

export function scopeLabel(scope) {
  return estreeCallView(scope.opener).label;
}
