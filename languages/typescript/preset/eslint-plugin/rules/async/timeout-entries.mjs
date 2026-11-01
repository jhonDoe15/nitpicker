import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
} from '../analysis/constant-resolution.mjs';
import { bindingsOf, importedFunction } from '../security/imported-names.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';
import { returnedValues } from './race-operations.mjs';
import {
  globalMemberCall,
  isGlobalTimerCall,
  isPromiseConstruction,
  nodesIn,
  ownNodesIn,
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

function namedIn(root, name) {
  return nodesIn(root).some((node) => node.type === 'Identifier' && node.name === name);
}

function timerExecutor(scope, node) {
  const executor = isPromiseConstruction(scope.context, node) ? node.arguments[0] : undefined;
  if (!isFunctionNode(executor)) {
    return undefined;
  }
  const timers = nodesIn(executor.body).filter((inner) => isGlobalTimerCall(scope.context, inner));
  if (timers.length === 0) {
    return undefined;
  }
  const reject = executor.params[1];
  return {
    text: 'a `new Promise` around `setTimeout`',
    rejects: reject?.type === 'Identifier' && timers.some((timer) => namedIn(timer, reject.name)),
  };
}

function isTimersPromisesCall(scope, node) {
  return (
    node.type === 'CallExpression' &&
    importedFunction(scope.context, node.callee, scope.timers) === 'setTimeout'
  );
}

function isSignalTimeout(scope, node) {
  const target = unwrapped(resolveConstant(scope.context, unwrapped(node)));
  return globalMemberCall(scope.context, target, 'AbortSignal.timeout');
}

function isEventsOnce(scope, node) {
  return (
    node.type === 'CallExpression' &&
    importedFunction(scope.context, node.callee, scope.events) === 'once' &&
    isSignalTimeout(scope, node.arguments[0])
  );
}

function directTimeout(scope, target) {
  const executor = timerExecutor(scope, target);
  if (executor !== undefined) {
    return executor;
  }
  if (isTimersPromisesCall(scope, target)) {
    return { text: '`setTimeout` from `node:timers/promises`', rejects: false };
  }
  return isEventsOnce(scope, target)
    ? { text: '`once(AbortSignal.timeout(...), "abort")`', rejects: false }
    : undefined;
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
    const method = memberName(callee);
    return (
      method === 'unref' ||
      CHAIN_METHODS.has(method) ||
      globalMemberCall(context, node, 'Promise.reject')
    );
  }
  const known = callee.type === 'Identifier' && TIMER_CALLS.has(callee.name);
  const settled = callee.type === 'Identifier' && parameters.has(callee.name);
  return known || settled || isGlobalTimerCall(context, node) || isTimersPromisesCall(scope, node);
}

function rejectsIn(scope, fn) {
  return ownNodesIn(fn.body).some(
    (node) =>
      (fn.async && node.type === 'ThrowStatement') ||
      globalMemberCall(scope.context, node, 'Promise.reject'),
  );
}

function chainLink(target) {
  const callee = target.type === 'CallExpression' ? unwrapped(target.callee) : undefined;
  return callee?.type === 'MemberExpression' && CHAIN_METHODS.has(memberName(callee))
    ? { base: callee.object, method: memberName(callee), callback: target.arguments[0] }
    : undefined;
}

function throwsFrom(scope, link) {
  const callback = unwrapped(link.callback);
  if (link.method !== 'then' || !isFunctionNode(callback)) {
    return false;
  }
  return ownNodesIn(callback.body).some(
    (node) =>
      node.type === 'ThrowStatement' || globalMemberCall(scope.context, node, 'Promise.reject'),
  );
}

function chainedTimer(scope, entry, find) {
  const chain = [entry];
  let thrown = false;
  for (const current of chain) {
    const target = unwrapped(resolveConstant(scope.context, unwrapped(current)));
    const found = target === undefined || chain.length > MAX_DEPTH + 1 ? undefined : find(target);
    if (found !== undefined) {
      return { ...found, rejects: found.rejects || thrown };
    }
    const link = target === undefined ? undefined : chainLink(target);
    thrown ||= link !== undefined && throwsFrom(scope, link);
    if (link !== undefined && chain.length <= MAX_DEPTH) {
      chain.push(link.base);
    }
  }
  return undefined;
}

function timerFunction(scope, fn) {
  const nodes = nodesIn(fn.body);
  const parameters = parameterNames(nodesIn(fn));
  const calls = nodes.filter(
    (node) => node.type === 'CallExpression' || node.type === 'NewExpression',
  );
  const timers = nodes.map((node) => directTimeout(scope, node)).filter(Boolean);
  if (timers.length === 0 || !calls.every((node) => isTimerOnlyCall(scope, node, parameters))) {
    return undefined;
  }
  const returned = returnedValues(fn).map((value) =>
    chainedTimer(scope, value, (target) => directTimeout(scope, target)),
  );
  const rejects = [...timers, ...returned].some((timer) => timer?.rejects === true);
  return { rejects: rejects || rejectsIn(scope, fn) };
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
  const text = `\`${callee.name}(...)\``;
  const fn = resolveFunction(scope.context, callee);
  const local = fn === undefined ? undefined : timerFunction(scope, fn);
  if (local !== undefined) {
    return { text, rejects: local.rejects };
  }
  return importedHelperName(scope, callee) === undefined ? undefined : { text, rejects: true };
}

function timerOf(scope, entry) {
  return chainedTimer(
    scope,
    entry,
    (target) => directTimeout(scope, target) ?? helperTimeout(scope, target),
  );
}

export function isTimer(scope, entry) {
  return timerOf(scope, entry) !== undefined;
}

export function timeoutOf(scope, entry) {
  const timer = timerOf(scope, entry);
  return timer?.rejects === true ? timer.text : undefined;
}
