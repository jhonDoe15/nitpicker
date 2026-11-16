import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  type SourceContext,
} from '../../../rules/analysis/constant-resolution.mts';
import { nameOf } from '../../../rules/typed/node-views.mts';
import { enclosingFunction } from '../../../test-quality/test-calls.mts';
import { inSet, nodesIn, propertyName, rootName } from '../nodes.mts';

type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;
export type Facts = {
  readonly advances: boolean;
  readonly flushesMicrotasks: boolean;
  readonly triggers: boolean;
  readonly waits: boolean;
  readonly drains: number[];
  readonly writes: boolean;
};
type CallFacts = Pick<Facts, 'advances' | 'flushesMicrotasks' | 'triggers'>;

const { DefinitionType } = TSESLint.Scope;
const NO_CALL_FACTS: CallFacts = { advances: false, flushesMicrotasks: false, triggers: false };
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
const DELAY_WAITS = new Set(['sleep', 'delay', 'wait', 'pause', 'waitForTimeout', 'setTimeout']);
const POLLING_WAITS = new Set(['waitFor', 'waitUntil', 'poll', 'setImmediate']);
const POLLING_FINDER = /^find(?:All)?By/u;
const TIMER_SCHEDULERS = new Set(['setTimeout', 'setImmediate', 'setInterval']);
export const UNKNOWN_DELAY = Number.POSITIVE_INFINITY;

export function isCallLike(node: TSESTree.Node): node is CallLike {
  return node.type === AST_NODE_TYPES.CallExpression || node.type === AST_NODE_TYPES.NewExpression;
}

function isClockReceiver(object: TSESTree.Node): boolean {
  const root = rootName(object);
  const callee = 'callee' in object ? object.callee : undefined;
  const names = [root, propertyName(object), propertyName(callee)].flatMap((name) => name ?? []);
  return inSet(CLOCK_RUNNERS, root) || names.some((name) => CLOCK_NAME.test(name));
}

function destructuredMethod(
  context: SourceContext,
  callee: TSESTree.Identifier,
): string | undefined {
  const definition = findVariable(context, callee, callee.name)?.defs.at(0);
  const declarator = definition?.type === DefinitionType.Variable ? definition.node : undefined;
  const pattern = declarator?.id;
  const isRunner =
    pattern?.type === AST_NODE_TYPES.ObjectPattern &&
    inSet(CLOCK_RUNNERS, nameOf(declarator?.init));
  const property = isRunner
    ? pattern.properties.find(
        (candidate): candidate is TSESTree.Property =>
          candidate.type === AST_NODE_TYPES.Property && nameOf(candidate.value) === callee.name,
      )
    : undefined;
  return nameOf(property?.key);
}

function clockMethod(context: SourceContext, callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return destructuredMethod(context, callee);
  }
  const object = callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
  return object !== undefined && isClockReceiver(object) ? propertyName(callee) : undefined;
}

function isCypressTick(callee: TSESTree.Node): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'cy' &&
    propertyName(callee) === 'tick'
  );
}

function callFacts(context: SourceContext, node: CallLike): CallFacts {
  const method = clockMethod(context, node.callee);
  return {
    advances: inSet(CLOCK_ADVANCES, method) || isCypressTick(node.callee),
    flushesMicrotasks: inSet(MICROTASK_FLUSHES, method),
    triggers: !(
      inSet(QUIET_ROOTS, rootName(node.callee)) || inSet(LOG_METHODS, propertyName(node.callee))
    ),
  };
}

function isMemberWrite(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.UpdateExpression) {
    return node.argument.type === AST_NODE_TYPES.MemberExpression;
  }
  return (
    node.type === AST_NODE_TYPES.AssignmentExpression &&
    node.left.type === AST_NODE_TYPES.MemberExpression
  );
}

function isWait(node: TSESTree.Node, owners: ReadonlySet<TSESTree.Node>): boolean {
  if (WAIT_TYPES.has(node.type)) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.ForOfStatement) {
    return node.await;
  }
  if (node.type === AST_NODE_TYPES.VariableDeclaration) {
    return node.kind === 'await using';
  }
  const owner = node.type === AST_NODE_TYPES.ReturnStatement ? enclosingFunction(node) : undefined;
  return (
    node.type === AST_NODE_TYPES.ReturnStatement &&
    node.argument !== null &&
    owner !== undefined &&
    owners.has(owner)
  );
}

function calledName(callee: TSESTree.Node): string | undefined {
  return callee.type === AST_NODE_TYPES.Identifier ? callee.name : propertyName(callee);
}

export function literalDelay(node: TSESTree.Node | undefined, missing: number): number {
  if (node === undefined) {
    return missing;
  }
  return node.type === AST_NODE_TYPES.Literal && typeof node.value === 'number'
    ? node.value
    : UNKNOWN_DELAY;
}

function promiseTimerDelays(context: SourceContext, node: TSESTree.NewExpression): number[] {
  const executor = nameOf(node.callee) === 'Promise' ? node.arguments[0] : undefined;
  if (executor === undefined || !isFunctionNode(executor)) {
    return [];
  }
  return nodesIn(context, executor.body).flatMap((inner) =>
    inner.type === AST_NODE_TYPES.CallExpression &&
    inSet(TIMER_SCHEDULERS, calledName(inner.callee))
      ? [literalDelay(inner.arguments[1], 0)]
      : [],
  );
}

function drainDelays(context: SourceContext, node: TSESTree.Node): number[] {
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return promiseTimerDelays(context, node);
  }
  const name = node.type === AST_NODE_TYPES.CallExpression ? calledName(node.callee) : undefined;
  if (node.type === AST_NODE_TYPES.CallExpression && inSet(DELAY_WAITS, name)) {
    return [literalDelay(node.arguments[0], 0)];
  }
  return inSet(POLLING_WAITS, name) || POLLING_FINDER.test(name ?? '') ? [UNKNOWN_DELAY] : [];
}

function timerDrains(context: SourceContext, node: TSESTree.Node, waits: boolean): number[] {
  const waited =
    waits &&
    (node.type === AST_NODE_TYPES.AwaitExpression ||
      node.type === AST_NODE_TYPES.YieldExpression ||
      node.type === AST_NODE_TYPES.ReturnStatement)
      ? node.argument
      : undefined;
  if (waited === undefined || waited === null) {
    return [];
  }
  return nodesIn(context, waited, (child) => !isFunctionNode(child)).flatMap((inner) =>
    drainDelays(context, inner),
  );
}

export function nodeFacts(
  context: SourceContext,
  node: TSESTree.Node,
  owners: ReadonlySet<TSESTree.Node>,
): Facts {
  const calls = isCallLike(node) ? callFacts(context, node) : NO_CALL_FACTS;
  const waits = isWait(node, owners);
  return {
    ...calls,
    waits,
    drains: timerDrains(context, node, waits),
    writes: isMemberWrite(node),
  };
}
