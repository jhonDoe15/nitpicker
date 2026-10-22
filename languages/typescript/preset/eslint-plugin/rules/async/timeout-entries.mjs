import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
} from '../analysis/constant-resolution.mjs';
import { bindingsOf, importedFunction } from '../security/imported-names.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';
import {
  globalMemberCall,
  isGlobalTimerCall,
  isPromiseConstruction,
  nodesIn,
} from './syntax-nodes.mjs';

const TIMER_MODULES = new Set(['timers/promises', 'node:timers/promises']);
const EVENT_MODULES = new Set(['events', 'node:events']);
const TIMEOUT_HELPERS = new Set([
  'rejectAfter',
  'rejectAfterTimeout',
  'rejectOnTimeout',
  'timeoutAfter',
  'timeoutPromise',
]);
const CHAIN_METHODS = new Set(['then', 'catch', 'finally']);
const TIMER_CALLS = new Set(['setTimeout', 'clearTimeout']);
const MAX_DEPTH = 4;

export function timeoutBindings(program) {
  return { timers: bindingsOf(program, TIMER_MODULES), events: bindingsOf(program, EVENT_MODULES) };
}

function usesTimerExecutor(scope, node) {
  if (!isPromiseConstruction(scope.context, node)) {
    return false;
  }
  const executor = node.arguments[0];
  return (
    isFunctionNode(executor) &&
    nodesIn(executor.body, scope.context.sourceCode.visitorKeys).some((inner) =>
      isGlobalTimerCall(scope.context, inner),
    )
  );
}

function isTimersPromisesCall(scope, node) {
  return (
    node.type === 'CallExpression' &&
    importedFunction(scope.context, node.callee, scope.timers) === 'setTimeout'
  );
}

function isSignalTimeout(scope, node) {
  const target = unwrapped(resolveConstant(scope.context, unwrapped(node)));
  return globalMemberCall(scope.context, target, 'AbortSignal', 'timeout');
}

function isEventsOnce(scope, node) {
  return (
    node.type === 'CallExpression' &&
    importedFunction(scope.context, node.callee, scope.events) === 'once' &&
    isSignalTimeout(scope, node.arguments[0])
  );
}

function directTimeout(scope, target) {
  if (usesTimerExecutor(scope, target)) {
    return 'a `new Promise` around `setTimeout`';
  }
  if (isTimersPromisesCall(scope, target)) {
    return '`setTimeout` from `node:timers/promises`';
  }
  return isEventsOnce(scope, target) ? '`once(AbortSignal.timeout(...), "abort")`' : undefined;
}

function parameterNames(nodes) {
  return new Set(
    nodes
      .filter((node) => isFunctionNode(node))
      .flatMap((node) => node.params)
      .filter((param) => param.type === 'Identifier')
      .map((param) => param.name),
  );
}

function isTimerOnlyCall(scope, node, parameters) {
  const { context } = scope;
  if (node.type === 'NewExpression') {
    return (
      isPromiseConstruction(context, node) ||
      (node.callee.type === 'Identifier' && node.callee.name.endsWith('Error'))
    );
  }
  const callee = unwrapped(node.callee);
  if (callee.type === 'MemberExpression') {
    return memberName(callee) === 'unref';
  }
  const known = callee.type === 'Identifier' && TIMER_CALLS.has(callee.name);
  const settled = callee.type === 'Identifier' && parameters.has(callee.name);
  return known || settled || isTimersPromisesCall(scope, node);
}

function isTimerFunction(scope, fn) {
  const nodes = nodesIn(fn.body, scope.context.sourceCode.visitorKeys);
  const parameters = parameterNames(nodesIn(fn, scope.context.sourceCode.visitorKeys));
  const calls = nodes.filter(
    (node) => node.type === 'CallExpression' || node.type === 'NewExpression',
  );
  const timer = nodes.some(
    (node) => usesTimerExecutor(scope, node) || isTimersPromisesCall(scope, node),
  );
  return timer && calls.every((node) => isTimerOnlyCall(scope, node, parameters));
}

function importedHelperName(scope, callee) {
  const definition = findVariable(scope.context, callee, callee.name)?.defs[0];
  const imported = definition?.type === 'ImportBinding' ? definition.node.imported : undefined;
  const name = imported?.type === 'Identifier' ? imported.name : imported?.value;
  return TIMEOUT_HELPERS.has(name) ? name : undefined;
}

function helperTimeout(scope, target) {
  const callee = target.type === 'CallExpression' ? unwrapped(target.callee) : undefined;
  if (callee?.type !== 'Identifier') {
    return undefined;
  }
  const fn = resolveFunction(scope.context, callee);
  const local = fn !== undefined && isTimerFunction(scope, fn);
  return local || importedHelperName(scope, callee) !== undefined
    ? `\`${callee.name}(...)\``
    : undefined;
}

function chainedBase(target) {
  const callee = target.type === 'CallExpression' ? unwrapped(target.callee) : undefined;
  return callee?.type === 'MemberExpression' && CHAIN_METHODS.has(memberName(callee))
    ? callee.object
    : undefined;
}

export function timeoutOf(scope, entry, depth = 0) {
  const target = unwrapped(resolveConstant(scope.context, unwrapped(entry)));
  if (target === undefined || depth > MAX_DEPTH) {
    return undefined;
  }
  const base = chainedBase(target);
  return (
    directTimeout(scope, target) ??
    helperTimeout(scope, target) ??
    (base === undefined ? undefined : timeoutOf(scope, base, depth + 1))
  );
}
