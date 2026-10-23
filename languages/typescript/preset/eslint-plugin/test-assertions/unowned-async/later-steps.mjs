import { ancestorsOf } from '../../rules/analysis/ancestry.mjs';
import { findVariable, isFunctionNode } from '../../rules/analysis/constant-resolution.mjs';
import { enclosingFunction } from '../../test-quality/test-calls.mjs';
import { hostShape, resolvedFunction } from './hosts.mjs';
import { children, nodesIn, propertyName, rootName } from './nodes.mjs';

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
const WAIT_TYPES = new Set(['AwaitExpression', 'YieldExpression']);
const CALL_TYPES = new Set(['CallExpression', 'NewExpression']);
const WRITE_TYPES = new Set(['AssignmentExpression', 'UpdateExpression']);

function isClockReceiver(object) {
  const root = rootName(object);
  const names = [root, propertyName(object), propertyName(object.callee)].filter(Boolean);
  return CLOCK_RUNNERS.has(root) || names.some((name) => CLOCK_NAME.test(name));
}

function destructuredMethod(context, callee) {
  const definition = findVariable(context, callee, callee.name)?.defs.at(0);
  const declarator = definition?.type === 'Variable' ? definition.node : undefined;
  const isRunner =
    declarator?.id.type === 'ObjectPattern' && CLOCK_RUNNERS.has(declarator.init?.name);
  const property = isRunner
    ? declarator.id.properties.find((candidate) => candidate.value?.name === callee.name)
    : undefined;
  return property?.key.name;
}

function clockMethod(context, callee) {
  if (callee.type === 'Identifier') {
    return destructuredMethod(context, callee);
  }
  const object = callee.type === 'MemberExpression' ? callee.object : undefined;
  return object !== undefined && isClockReceiver(object) ? propertyName(callee) : undefined;
}

function isCypressTick(callee) {
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'cy' &&
    propertyName(callee) === 'tick'
  );
}

function callFacts(context, node) {
  const method = clockMethod(context, node.callee);
  return {
    advances: CLOCK_ADVANCES.has(method) || isCypressTick(node.callee),
    flushesMicrotasks: MICROTASK_FLUSHES.has(method),
    triggers:
      !QUIET_ROOTS.has(rootName(node.callee)) && !LOG_METHODS.has(propertyName(node.callee)),
  };
}

function isMemberWrite(node) {
  if (!WRITE_TYPES.has(node.type)) {
    return false;
  }
  const target = node.type === 'UpdateExpression' ? node.argument : node.left;
  return target.type === 'MemberExpression';
}

function isWait(node, owners) {
  if (WAIT_TYPES.has(node.type)) {
    return true;
  }
  if (node.type === 'ForOfStatement') {
    return node.await;
  }
  if (node.type === 'VariableDeclaration') {
    return node.kind === 'await using';
  }
  return (
    node.type === 'ReturnStatement' && node.argument !== null && owners.has(enclosingFunction(node))
  );
}

function nodeFacts(context, node, owners) {
  const calls = CALL_TYPES.has(node.type) ? callFacts(context, node) : {};
  return { ...calls, waits: isWait(node, owners), writes: isMemberWrite(node) };
}

function runsInline({ context, bindings }, node) {
  if (!isFunctionNode(node)) {
    return true;
  }
  const call = node.parent;
  const isPassed =
    CALL_TYPES.has(call.type) && (call.arguments.includes(node) || call.callee === node);
  return isPassed && hostShape(context, call, bindings) === undefined;
}

function unfollowedHelper(env, node, followed) {
  const helper =
    node.type === 'CallExpression' ? resolvedFunction(env.context, node.callee) : undefined;
  if (helper === undefined || followed.has(helper)) {
    return undefined;
  }
  followed.add(helper);
  return helper.body;
}

function reachableNodes(env, roots) {
  const pending = [...new Set(roots)];
  const followed = new Set();
  const found = [];
  for (const root of pending) {
    const own = nodesIn(env.context, root, (child) => runsInline(env, child));
    const bodies = own.map((node) => unfollowedHelper(env, node, followed));
    found.push(own);
    pending.push(...bodies.filter((body) => body !== undefined));
  }
  return found.flat();
}

export function stepFacts(env, roots, owners) {
  const facts = reachableNodes(env, roots).map((node) => nodeFacts(env.context, node, owners));
  return {
    waits: facts.some((fact) => fact.waits),
    advances: facts.some((fact) => fact.advances),
    flushesMicrotasks: facts.some((fact) => fact.flushesMicrotasks),
    writes: facts.some((fact) => fact.writes),
    triggers: facts.some((fact) => fact.triggers),
  };
}

function laterSiblings(context, node) {
  return children(context, node.parent).filter((sibling) => sibling.range[0] >= node.range[1]);
}

function climb(start, test) {
  const chain = [start, ...ancestorsOf(start)];
  const stop = chain.indexOf(test);
  return stop === -1 ? chain : chain.slice(0, stop);
}

function namedBinding(fn) {
  if (fn.type === 'FunctionDeclaration') {
    return fn;
  }
  return fn.parent.type === 'VariableDeclarator' && fn.parent.init === fn ? fn.parent : undefined;
}

function localUses(context, node) {
  const binding = isFunctionNode(node) ? namedBinding(node) : undefined;
  const variable =
    binding === undefined
      ? undefined
      : context.sourceCode
          .getDeclaredVariables(binding)
          .find((candidate) =>
            candidate.defs.some((def) => def.node === binding && def.type !== 'Parameter'),
          );
  return (variable?.references ?? []).filter((ref) => !ref.init).map((ref) => ref.identifier);
}

function rootsFrom(context, start, test) {
  const roots = [];
  for (const node of climb(start, test)) {
    for (const sibling of laterSiblings(context, node)) {
      roots.push(sibling);
    }
    const uses = localUses(context, node);
    if (uses.length > 0) {
      return { roots, uses };
    }
  }
  return { roots, uses: [] };
}

export function ownerRoots(context, host, test) {
  const starts = [host.node];
  const roots = [];
  for (const start of starts) {
    const found = rootsFrom(context, start, test);
    for (const root of found.roots) {
      roots.push(root);
    }
    starts.push(...found.uses.filter((use) => !starts.includes(use)));
  }
  return roots;
}

export function isOwnedByLaterStep(host, facts) {
  if (host.kind === 'timer') {
    return facts.waits || facts.advances;
  }
  if (host.kind === 'microtask') {
    return facts.waits || facts.flushesMicrotasks;
  }
  return host.kind === 'listener' && (facts.waits || facts.writes || facts.triggers);
}
