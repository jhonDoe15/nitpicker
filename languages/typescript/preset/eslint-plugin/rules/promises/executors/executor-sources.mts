import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isNode, type SourceCode } from '../../typed/node-views.mts';
import { resolveConstant, stringValue } from '../../analysis/constant-resolution.mts';
import { memberName } from '../../analysis/test-code-analysis.mts';

const LISTENERS = new Set<string>([
  'on',
  'once',
  'addListener',
  'addEventListener',
  'prependListener',
  'prependOnceListener',
]);
const TIMERS = new Set<string>([
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'nextTick',
  'requestAnimationFrame',
  'requestIdleCallback',
  'IntersectionObserver',
  'MutationObserver',
  'ResizeObserver',
  'PerformanceObserver',
  'debounce',
  'throttle',
]);
const IN_PLACE = new Set<string>([
  'forEach',
  'map',
  'filter',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flatMap',
  'sort',
  'toSorted',
  'from',
  'replace',
  'replaceAll',
  'push',
  'unshift',
  'add',
  'set',
  'splice',
]);
const SAFE_EVENTS = new Set<string>([
  'abort',
  'exit',
  'beforeExit',
  'DOMContentLoaded',
  'readystatechange',
  'visibilitychange',
]);
const PAGE_GLOBALS = new Set<string>(['window', 'document', 'globalThis', 'self']);
const MAX_TEXT = 40;

type Context = { readonly sourceCode: SourceCode };
type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;
type MemberCall = CallLike & { readonly callee: TSESTree.MemberExpression };
type ExecutorFunction = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
type PromiseConstruction = TSESTree.NewExpression & {
  readonly arguments: readonly [ExecutorFunction, ...TSESTree.CallExpressionArgument[]];
};
type Settlers = ReadonlySet<string>;
type ReceiverSource = {
  readonly call: MemberCall;
  readonly receiver: string;
  readonly text: string;
};
type ListenerSource = ReceiverSource & {
  readonly kind: 'listener';
  readonly event: string | undefined;
};
type PipeSource = ReceiverSource & { readonly kind: 'pipe'; readonly event?: undefined };
type CallbackSource = {
  readonly kind: 'callback';
  readonly call: CallLike;
  readonly text: string;
};
export type ExecutorSource = ListenerSource | PipeSource | CallbackSource;
export type PromiseExecutor = {
  readonly executor: ExecutorFunction;
  readonly resolve: TSESLint.Scope.Variable;
  readonly rejects: boolean;
  readonly settlers: readonly TSESLint.Scope.Variable[];
  readonly sources: readonly ExecutorSource[];
};
export function isListenerCall(
  node: TSESTree.Node | undefined,
): node is TSESTree.CallExpression & { readonly callee: TSESTree.MemberExpression } {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    LISTENERS.has(memberName(node.callee) ?? '')
  );
}

export function isFunctionExpression(node: TSESTree.Node | undefined): node is ExecutorFunction {
  return (
    node?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node?.type === AST_NODE_TYPES.FunctionExpression
  );
}

function isCall(node: TSESTree.Node): node is CallLike {
  return node.type === AST_NODE_TYPES.CallExpression || node.type === AST_NODE_TYPES.NewExpression;
}

function hasMemberCallee(call: CallLike): call is MemberCall {
  return call.callee.type === AST_NODE_TYPES.MemberExpression;
}

function isPromiseConstruction(node: TSESTree.Node | undefined): node is PromiseConstruction {
  return (
    node?.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Promise' &&
    isFunctionExpression(node.arguments[0])
  );
}

export function nodesInside(
  context: Context,
  root: TSESTree.Node,
  { nested }: { readonly nested: boolean } = { nested: false },
): TSESTree.Node[] {
  const keys = context.sourceCode.visitorKeys;
  const nodes: TSESTree.Node[] = [];
  const pending = [root];
  for (const node of pending) {
    nodes.push(node);
    if (!nested && node !== root && isPromiseConstruction(node)) {
      continue;
    }
    for (const key of keys[node.type] ?? []) {
      const value: unknown = Reflect.get(node, key);
      const children: unknown[] = Array.isArray(value) ? value : [value];
      pending.push(...children.filter(isNode));
    }
  }
  return nodes;
}

export function shortText(context: Context, node: TSESTree.Node): string {
  const text = context.sourceCode.getText(node);
  if (text.length <= MAX_TEXT && !text.includes('\n')) {
    return text;
  }
  return memberName(node) ?? 'a call';
}

function calleeName(callee: TSESTree.Node): string {
  return (callee.type === AST_NODE_TYPES.Identifier ? callee.name : memberName(callee)) ?? '';
}

function isSafeEvent(event: string | undefined, receiver: TSESTree.Node): boolean {
  const global = receiver.type === AST_NODE_TYPES.Identifier ? receiver.name : undefined;
  return (
    event !== undefined &&
    (SAFE_EVENTS.has(event) ||
      (event.startsWith('SIG') && global === 'process') ||
      (event === 'load' && PAGE_GLOBALS.has(global ?? '')))
  );
}

function isSettler(node: TSESTree.Node | undefined, settlers: Settlers): boolean {
  return node?.type === AST_NODE_TYPES.Identifier && settlers.has(node.name);
}

function mentionsSettler(context: Context, node: TSESTree.Node, settlers: Settlers): boolean {
  return nodesInside(context, node).some((inner) => isSettler(inner, settlers));
}

function settlingArgument(
  context: Context,
  argument: TSESTree.CallExpressionArgument,
  settlers: Settlers,
): boolean {
  if (isSettler(argument, settlers)) {
    return true;
  }
  if (isFunctionExpression(argument)) {
    return mentionsSettler(context, argument.body, settlers);
  }
  return isCall(argument) && argument.arguments.some((inner) => isSettler(inner, settlers));
}

function listenerSource(
  context: Context,
  call: MemberCall,
  settlers: Settlers,
): ListenerSource | undefined {
  const event = stringValue(resolveConstant(context, call.arguments[0]));
  if (
    isSafeEvent(event, call.callee.object) ||
    !call.arguments.slice(1).some((argument) => settlingArgument(context, argument, settlers))
  ) {
    return undefined;
  }
  const receiver = context.sourceCode.getText(call.callee.object);
  const name = event === undefined ? '...' : `'${event}'`;
  const shown = `${shortText(context, call.callee.object)}.${String(memberName(call.callee))}(${name})`;
  return { kind: 'listener', call, event, receiver, text: `\`${shown}\`` };
}

function pipeSource(
  context: Context,
  call: MemberCall,
  settlers: Settlers,
): PipeSource | undefined {
  return call.arguments.some((argument) => mentionsSettler(context, argument, settlers))
    ? {
        kind: 'pipe',
        call,
        receiver: context.sourceCode.getText(call.callee.object),
        text: `\`${shortText(context, call.callee.object)}.pipe(...)\``,
      }
    : undefined;
}

function sourceOf(
  context: Context,
  call: CallLike,
  settlers: Settlers,
): ExecutorSource | undefined {
  const name = calleeName(call.callee);
  if (hasMemberCallee(call) && LISTENERS.has(name)) {
    return listenerSource(context, call, settlers);
  }
  if (hasMemberCallee(call) && name === 'pipe') {
    return pipeSource(context, call, settlers);
  }
  if (
    isPromiseConstruction(call) ||
    TIMERS.has(name) ||
    IN_PLACE.has(name) ||
    settlers.has(name) ||
    !call.arguments.some((argument) => settlingArgument(context, argument, settlers))
  ) {
    return undefined;
  }
  return {
    kind: 'callback',
    call,
    text: `the callback passed to \`${shortText(context, call.callee)}\``,
  };
}

function executorSources(
  context: Context,
  executor: ExecutorFunction,
  settlers: Settlers,
): ExecutorSource[] {
  return nodesInside(context, executor.body)
    .filter(isCall)
    .map((call) => sourceOf(context, call, settlers))
    .filter((source) => source !== undefined);
}

function parameterVariable(
  context: Context,
  executor: ExecutorFunction,
  parameter: TSESTree.Parameter | undefined,
): TSESLint.Scope.Variable | undefined {
  if (parameter?.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  return context.sourceCode
    .getDeclaredVariables(executor)
    .find((variable) => variable.name === parameter.name);
}

export function promiseExecutor(
  context: Context,
  construction: TSESTree.NewExpression,
): PromiseExecutor | undefined {
  if (!isPromiseConstruction(construction)) {
    return undefined;
  }
  const executor = construction.arguments[0];
  const resolve = parameterVariable(context, executor, executor.params[0]);
  if (resolve === undefined) {
    return undefined;
  }
  const reject = parameterVariable(context, executor, executor.params[1]);
  const settlers = [resolve, reject].filter((variable) => variable !== undefined);
  const sources = executorSources(context, executor, new Set(settlers.map(({ name }) => name)));
  return sources.length === 0
    ? undefined
    : { executor, resolve, rejects: (reject?.references.length ?? 0) > 0, settlers, sources };
}
