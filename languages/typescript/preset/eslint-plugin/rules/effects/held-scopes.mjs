import { ancestorsOf } from '../analysis/ancestry.mjs';
import { childrenOf, contains } from '../loops/loop-shapes.mjs';
import { isOwned } from '../support/flow/scope-owners.mjs';
import { estreeRunsWithCaller } from '../support/flow/sync-callbacks.mjs';
import { estreeCallView } from '../support/io/call-views.mjs';
import { memoized } from '../support/memo.mjs';

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);
const CALL = 'CallExpression';
const TRANSACTION = 'transaction';
const BEGINS = 'begins';
const ENDS = 'ends';
const SQL_METHODS = new Set(['query', 'execute', 'exec', 'raw', 'run']);
const BEGIN_TEXT = /^\s*(?:BEGIN|START\s+TRANSACTION)\b/iu;
const END_TEXT = /^\s*(?:COMMIT|ROLLBACK)\b/iu;
const SCOPES = {
  transaction: {
    callbacks: new Set(['$transaction', TRANSACTION, 'transactional']),
    begins: new Set(['startTransaction', 'beginTransaction', TRANSACTION]),
    ends: new Set(['commit', 'commitTransaction', 'rollback', 'rollbackTransaction']),
  },
  lock: {
    callbacks: new Set(['runExclusive', 'acquire', 'request', 'using']),
    begins: new Set(['acquire']),
    ends: new Set(['release', 'unlock', 'releaseLock']),
  },
};
const BRANCHES = new Set(['IfStatement', 'CatchClause', 'SwitchCase', 'ConditionalExpression']);
const bodyIndexes = new WeakMap();
const callbackScopes = new WeakMap();

function isFunction(node) {
  return FUNCTIONS.has(node?.type);
}

function hasCallback(call) {
  return call.arguments.some(isFunction);
}

function runsWithCaller(node) {
  return !isFunction(node) || estreeRunsWithCaller(node);
}

export function callsWithin(root, visitorKeys) {
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

function calleeMethod(call) {
  const { callee } = call;
  if (callee.type === 'MemberExpression') {
    return callee.computed ? undefined : callee.property.name;
  }
  return callee.type === 'Identifier' ? callee.name : undefined;
}

function isCallbackOpener(kind, fn, context) {
  const call = fn.parent;
  const isOpenerCall =
    call.type === CALL &&
    call.arguments.includes(fn) &&
    SCOPES[kind].callbacks.has(calleeMethod(call));
  return (
    isOpenerCall && isOwned(kind, { call, view: estreeCallView(call), role: 'callbacks' }, context)
  );
}

function statementText(kind, view) {
  const [first] = view.args;
  const isSql = kind === TRANSACTION && SQL_METHODS.has(view.method) && first?.type === 'text';
  return isSql ? first.text : '';
}

function isMarkerCandidate(kind, call) {
  const method = calleeMethod(call);
  const scope = SCOPES[kind];
  return (
    scope.ends.has(method) ||
    scope.begins.has(method) ||
    (kind === TRANSACTION && SQL_METHODS.has(method))
  );
}

function markerRole(kind, call, context) {
  if (call.type !== CALL || hasCallback(call) || !isMarkerCandidate(kind, call)) {
    return undefined;
  }
  const view = estreeCallView(call);
  const text = statementText(kind, view);
  if (SCOPES[kind].ends.has(view.method) || END_TEXT.test(text)) {
    return ENDS;
  }
  const begins = SCOPES[kind].begins.has(view.method) || BEGIN_TEXT.test(text);
  return begins && isOwned(kind, { call, view, role: BEGINS }, context) ? BEGINS : undefined;
}

function branchOf(node, body) {
  const inside = ancestorsOf(node).filter((ancestor) => contains(body, ancestor));
  return inside.find(
    (ancestor) =>
      BRANCHES.has(ancestor.type) &&
      !(ancestor.test !== undefined && contains(ancestor.test, node)),
  );
}

function bodyIndex(kind, body, context) {
  const perBody = memoized(bodyIndexes, body, () => new Map());
  return memoized(perBody, kind, () => {
    const calls = callsWithin(body, context.sourceCode.visitorKeys);
    const markers = calls
      .map((call) => ({ call, role: markerRole(kind, call, context) }))
      .filter(({ role }) => role !== undefined)
      .map((marker) => ({ ...marker, branch: branchOf(marker.call, body) }));
    return { body, calls, markers, scopes: new Map() };
  });
}

function closes(marker, node) {
  return marker.branch === undefined || contains(marker.branch, node);
}

function openScope(index, begin) {
  const end = index.markers.find(
    (marker) =>
      marker.role === ENDS && marker.call.range[0] >= begin.range[1] && closes(marker, begin),
  )?.call;
  const calls = index.calls.filter(
    (call) =>
      call.range[0] >= begin.range[1] && (end === undefined || call.range[1] <= end.range[0]),
  );
  const root = index.body;
  return { opener: begin, calls, param: estreeCallView(begin).root, closing: end, root };
}

function rangeScope(index, node) {
  const last = index.markers
    .filter((marker) => marker.call.range[1] <= node.range[0])
    .filter((marker) => marker.role === BEGINS || closes(marker, node))
    .at(-1);
  return last?.role === BEGINS
    ? memoized(index.scopes, last.call, () => openScope(index, last.call))
    : undefined;
}

function callbackScope(kind, node, context) {
  for (const fn of ancestorsOf(node).filter(isFunction)) {
    if (isCallbackOpener(kind, fn, context)) {
      return memoized(callbackScopes, fn, () => ({
        opener: fn.parent,
        calls: callsWithin(fn.body, context.sourceCode.visitorKeys),
        param: fn.params[0],
        root: fn.body,
        closing: fn.parent.parent.type === 'AwaitExpression' ? fn.parent : undefined,
      }));
    }
    if (!estreeRunsWithCaller(fn)) {
      return undefined;
    }
  }
  return undefined;
}

function unitBody(node, sourceCode) {
  const fn = ancestorsOf(node)
    .filter(isFunction)
    .find((each) => !estreeRunsWithCaller(each));
  return fn === undefined ? sourceCode.ast : fn.body;
}

export function heldScope(kind, node, context) {
  const callback = callbackScope(kind, node, context);
  if (callback !== undefined) {
    return callback;
  }
  return rangeScope(bodyIndex(kind, unitBody(node, context.sourceCode), context), node);
}

export function isOnParameter(call, param) {
  const { root } = estreeCallView(call);
  return param?.type === 'Identifier' && root?.name === param.name;
}

export function scopeLabel(scope) {
  return estreeCallView(scope.opener).label;
}
