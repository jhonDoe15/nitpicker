import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
} from '../../analysis/constant-resolution.mts';
import {
  bindingsOf,
  importedFunction,
  type ModuleBindings,
} from '../../security/imported-names.mts';
import { memberName, unwrapped, type Context } from '../../security/security-values.mts';
import { returnedValues } from './race-operations.mts';
import {
  globalMemberCall,
  isGlobalTimerCall,
  isPromiseConstruction,
  nodesIn,
  ownNodesIn,
} from './syntax-nodes.mts';

export type TimeoutBindings = {
  readonly timers: ModuleBindings;
  readonly events: ModuleBindings;
};
type Scope = TimeoutBindings & { readonly context: Context };
type Timer = { readonly text: string; readonly rejects: boolean };
type FunctionLike = NonNullable<ReturnType<typeof resolveFunction>>;
type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;
type ChainLink = {
  readonly base: TSESTree.Node;
  readonly method: string | undefined;
  readonly callback: TSESTree.Node | undefined;
};

const PROMISE_REJECT = 'Promise.reject';
const { DefinitionType } = TSESLint.Scope;
const TIMER_MODULES = new Set(['timers/promises', 'node:timers/promises']);
const EVENT_MODULES = new Set(['events', 'node:events']);
const TIMEOUT_HELPERS = new Set<string>([
  'rejectAfter',
  'rejectAfterTimeout',
  'rejectOnTimeout',
  'timeoutAfter',
  'timeoutPromise',
]);
const CHAIN_METHODS = new Set<string>(['then', 'catch', 'finally']);
const TIMER_CALLS = new Set<string>(['setTimeout', 'clearTimeout']);
const MAX_DEPTH = 4;

export function timeoutBindings(program: TSESTree.Program): TimeoutBindings {
  return { timers: bindingsOf(program, TIMER_MODULES), events: bindingsOf(program, EVENT_MODULES) };
}

function namedIn(root: TSESTree.Node, name: string): boolean {
  return nodesIn(root).some(
    (node) => node.type === AST_NODE_TYPES.Identifier && node.name === name,
  );
}

function timerExecutor(scope: Scope, node: TSESTree.Node): Timer | undefined {
  const executor =
    node.type === AST_NODE_TYPES.NewExpression && isPromiseConstruction(scope.context, node)
      ? node.arguments[0]
      : undefined;
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
    rejects:
      reject?.type === AST_NODE_TYPES.Identifier &&
      timers.some((timer) => namedIn(timer, reject.name)),
  };
}

function isTimersPromisesCall(scope: Scope, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    importedFunction(scope.context, node.callee, scope.timers) === 'setTimeout'
  );
}

function isSignalTimeout(scope: Scope, node: TSESTree.Node | undefined): boolean {
  const target = unwrapped(resolveConstant(scope.context, unwrapped(node)));
  return globalMemberCall(scope.context, target, 'AbortSignal.timeout');
}

function isEventsOnce(scope: Scope, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    importedFunction(scope.context, node.callee, scope.events) === 'once' &&
    isSignalTimeout(scope, node.arguments[0])
  );
}

function directTimeout(scope: Scope, target: TSESTree.Node): Timer | undefined {
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

function parameterNames(nodes: readonly TSESTree.Node[]): Set<string> {
  return new Set(
    nodes
      .flatMap((node) => (isFunctionNode(node) ? node.params : []))
      .flatMap((param) => (param.type === AST_NODE_TYPES.Identifier ? [param.name] : [])),
  );
}

function isTimerOnlyCall(scope: Scope, node: CallLike, parameters: ReadonlySet<string>): boolean {
  const { context } = scope;
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return (
      isPromiseConstruction(context, node) ||
      (node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name.endsWith('Error'))
    );
  }
  const callee = unwrapped(node.callee);
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    const method = memberName(callee);
    return (
      method === 'unref' ||
      CHAIN_METHODS.has(method ?? '') ||
      globalMemberCall(context, node, PROMISE_REJECT)
    );
  }
  const known = callee.type === AST_NODE_TYPES.Identifier && TIMER_CALLS.has(callee.name);
  const settled = callee.type === AST_NODE_TYPES.Identifier && parameters.has(callee.name);
  return known || settled || isGlobalTimerCall(context, node) || isTimersPromisesCall(scope, node);
}

function rejectsIn(scope: Scope, fn: FunctionLike, body: TSESTree.Node): boolean {
  return ownNodesIn(body).some(
    (node) =>
      (fn.async && node.type === AST_NODE_TYPES.ThrowStatement) ||
      globalMemberCall(scope.context, node, PROMISE_REJECT),
  );
}

function chainLink(target: TSESTree.Node): ChainLink | undefined {
  if (target.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = unwrapped(target.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    CHAIN_METHODS.has(memberName(callee) ?? '')
    ? { base: callee.object, method: memberName(callee), callback: target.arguments[0] }
    : undefined;
}

function throwsFrom(scope: Scope, link: ChainLink): boolean {
  const callback = unwrapped(link.callback);
  if (link.method !== 'then' || !isFunctionNode(callback)) {
    return false;
  }
  return ownNodesIn(callback.body).some(
    (node) =>
      node.type === AST_NODE_TYPES.ThrowStatement ||
      globalMemberCall(scope.context, node, PROMISE_REJECT),
  );
}

function chainedTimer(
  scope: Scope,
  entry: TSESTree.Node,
  find: (target: TSESTree.Node) => Timer | undefined,
): Timer | undefined {
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

function timerFunction(scope: Scope, fn: FunctionLike): { readonly rejects: boolean } | undefined {
  const body = fn.body ?? undefined;
  if (body === undefined) {
    return undefined;
  }
  const nodes = nodesIn(body);
  const parameters = parameterNames(nodesIn(fn));
  const calls = nodes.filter(
    (node): node is CallLike =>
      node.type === AST_NODE_TYPES.CallExpression || node.type === AST_NODE_TYPES.NewExpression,
  );
  const timers = nodes
    .map((node) => directTimeout(scope, node))
    .filter((timer) => timer !== undefined);
  if (timers.length === 0 || !calls.every((node) => isTimerOnlyCall(scope, node, parameters))) {
    return undefined;
  }
  const returned = returnedValues(fn).map((value) =>
    chainedTimer(scope, value, (target) => directTimeout(scope, target)),
  );
  const rejects = [...timers, ...returned].some((timer) => timer?.rejects === true);
  return { rejects: rejects || rejectsIn(scope, fn, body) };
}

function importedHelperName(scope: Scope, callee: TSESTree.Identifier): string | undefined {
  const definition = findVariable(scope.context, callee, callee.name)?.defs[0];
  const node = definition?.type === DefinitionType.ImportBinding ? definition.node : undefined;
  const imported = node?.type === AST_NODE_TYPES.ImportSpecifier ? node.imported : undefined;
  const name = imported?.type === AST_NODE_TYPES.Identifier ? imported.name : imported?.value;
  return name !== undefined && TIMEOUT_HELPERS.has(name) ? name : undefined;
}

function helperTimeout(scope: Scope, target: TSESTree.Node): Timer | undefined {
  const callee =
    target.type === AST_NODE_TYPES.CallExpression ? unwrapped(target.callee) : undefined;
  if (callee?.type !== AST_NODE_TYPES.Identifier) {
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

function timerOf(scope: Scope, entry: TSESTree.Node): Timer | undefined {
  return chainedTimer(
    scope,
    entry,
    (target) => directTimeout(scope, target) ?? helperTimeout(scope, target),
  );
}

export function isTimer(scope: Scope, entry: TSESTree.Node): boolean {
  return timerOf(scope, entry) !== undefined;
}

export function timeoutOf(scope: Scope, entry: TSESTree.Node): string | undefined {
  const timer = timerOf(scope, entry);
  return timer?.rejects === true ? timer.text : undefined;
}
