import { resolveFunction } from '../../rules/analysis/constant-resolution.mjs';
import { propertyName, rootName } from './hosts.mjs';

const CLOCK_ADVANCES = new Set([
  'advanceTimersByTime',
  'advanceTimersByTimeAsync',
  'advanceTimersToNextTimer',
  'advanceTimersToNextTimerAsync',
  'advanceTimersToNextFrame',
  'runAllTimers',
  'runAllTimersAsync',
  'runOnlyPendingTimers',
  'runOnlyPendingTimersAsync',
  'runAllImmediates',
  'runAll',
  'runAllAsync',
  'runToLast',
  'runToLastAsync',
  'tick',
  'tickAsync',
  'next',
  'nextAsync',
  'jump',
  'fastForward',
  'runFor',
]);
const MICROTASK_FLUSHES = new Set(['runAllTicks', 'runMicrotasks']);
const CLOCK_RUNNERS = new Set(['vi', 'vitest', 'jest']);
const CLOCK_NAME = /clock|timer/iu;
const QUIET_ROOTS = new Set([
  'console',
  'Math',
  'JSON',
  'Object',
  'Array',
  'String',
  'Number',
  'Date',
  'expect',
  'assert',
]);
const LOG_METHODS = new Set(['log', 'info', 'debug', 'warn', 'error', 'trace']);
const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
]);

function children(context, node) {
  return (context.sourceCode.visitorKeys[node.type] ?? [])
    .flatMap((key) => (Array.isArray(node[key]) ? node[key] : [node[key]]))
    .filter((child) => child !== null && typeof child?.type === 'string');
}

export function nodesIn(context, root, { intoFunctions }) {
  const pending = [root];
  for (const node of pending) {
    const inner = children(context, node).filter(
      (child) => intoFunctions || !FUNCTION_TYPES.has(child.type),
    );
    for (const child of inner) {
      pending.push(child);
    }
  }
  return pending;
}

function isClockReceiver(object) {
  const root = rootName(object);
  const names = [root, propertyName(object)].filter(Boolean);
  return CLOCK_RUNNERS.has(root) || names.some((name) => CLOCK_NAME.test(name));
}

function callFacts(node) {
  const method = propertyName(node.callee);
  const object = node.callee.type === 'MemberExpression' ? node.callee.object : undefined;
  const root = rootName(node.callee);
  return {
    advances: CLOCK_ADVANCES.has(method) && object !== undefined && isClockReceiver(object),
    flushesMicrotasks: MICROTASK_FLUSHES.has(method),
    triggers: !QUIET_ROOTS.has(root) && !LOG_METHODS.has(method),
  };
}

function isMemberWrite(node) {
  const target = node.type === 'UpdateExpression' ? node.argument : node.left;
  return target?.type === 'MemberExpression';
}

function nodeFacts(node) {
  if (node.type === 'AwaitExpression' || node.type === 'YieldExpression') {
    return { waits: true };
  }
  if (node.type === 'ForOfStatement' && node.await) {
    return { waits: true };
  }
  if (node.type === 'CallExpression' || node.type === 'NewExpression') {
    return callFacts(node);
  }
  const writes = node.type === 'AssignmentExpression' || node.type === 'UpdateExpression';
  return writes && isMemberWrite(node) ? { writes: true } : {};
}

function stepNodes(context, statement) {
  const own = nodesIn(context, statement, { intoFunctions: false });
  const helpers = own
    .filter((node) => node.type === 'CallExpression')
    .map((node) => resolveFunction(context, node.callee))
    .filter((helper) => helper !== undefined);
  return [
    ...own,
    ...helpers.flatMap((helper) => nodesIn(context, helper.body, { intoFunctions: false })),
  ];
}

export function stepFacts(context, statement) {
  const facts = stepNodes(context, statement).map(nodeFacts);
  return {
    waits: facts.some((fact) => fact.waits),
    advances: facts.some((fact) => fact.advances),
    flushesMicrotasks: facts.some((fact) => fact.flushesMicrotasks),
    writes: facts.some((fact) => fact.writes),
    triggers: facts.some((fact) => fact.triggers),
  };
}

export function isOwnedByLaterStep(host, steps) {
  if (host.kind === 'timer') {
    return steps.some((step) => step.waits || step.advances);
  }
  if (host.kind === 'microtask') {
    return steps.some((step) => step.waits || step.flushesMicrotasks);
  }
  if (host.kind === 'listener') {
    return steps.some((step) => step.waits || step.writes || step.triggers);
  }
  return false;
}
