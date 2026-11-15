import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, type SourceCode } from '../typed/node-views.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';
import { enclosingFunction, isEffectCallback, type FunctionNode } from './react-effects.mts';

type MessageIds = 'fetchInEffect' | 'asyncInEffect';
type Context = Readonly<TSESLint.RuleContext<MessageIds, []>>;
type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;
type Entry = { requested: boolean; firstAsync: TSESTree.Node | undefined };
type SetterCall = { readonly chain: FunctionNode[]; readonly anchor: TSESTree.Node };
type State = {
  readonly awaitsIn: Map<FunctionNode | undefined, TSESTree.AwaitExpression[]>;
  readonly setterCalls: SetterCall[];
  readonly effects: Map<FunctionNode | undefined, Entry>;
};

const requestFunctions = new Set(['fetch', 'axios', 'ky']);
const requestLibraries = new Set(['axios', 'ky']);
const globalObjects = new Set(['window', 'globalThis', 'self']);

function isGlobalFetch(callee: TSESTree.MemberExpression): boolean {
  return (
    callee.object.type === AST_NODE_TYPES.Identifier &&
    globalObjects.has(callee.object.name) &&
    !callee.computed &&
    nameOf(callee.property) === 'fetch'
  );
}

function isMemberRequest(callee: TSESTree.Node): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    (requestLibraries.has(callee.object.name) || isGlobalFetch(callee))
  );
}

function sendsRequest(node: CallLike): boolean {
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'XMLHttpRequest';
  }
  return (
    (node.callee.type === AST_NODE_TYPES.Identifier && requestFunctions.has(node.callee.name)) ||
    isMemberRequest(node.callee)
  );
}

const timerFunctions = new Set<string | undefined>([
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
]);
const promiseCallbacks = new Set<string | undefined>(['then', 'catch', 'finally']);
const stateSetter = /^set[A-Z]/u;
const MAX_OWNERS = 8;

function isTimerCallback(fn: FunctionNode): boolean {
  const call = fn.parent;
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.arguments[0] === fn &&
    timerFunctions.has(calleeNameOf(call.callee))
  );
}

function isPromiseCallback(fn: FunctionNode): boolean {
  const call = fn.parent;
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.some((argument) => argument === fn) &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    promiseCallbacks.has(calleeNameOf(call.callee))
  );
}

function bindingOf(
  fn: FunctionNode,
): TSESTree.FunctionDeclaration | TSESTree.VariableDeclarator | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn;
  }
  const declarator = fn.parent;
  return declarator.type === AST_NODE_TYPES.VariableDeclarator && declarator.init === fn
    ? declarator
    : undefined;
}

function directCallsOf(sourceCode: SourceCode, fn: FunctionNode): TSESTree.CallExpression[] {
  if (fn.parent.type === AST_NODE_TYPES.CallExpression && fn.parent.callee === fn) {
    return [fn.parent];
  }
  const binding = bindingOf(fn);
  const variables = binding === undefined ? [] : sourceCode.getDeclaredVariables(binding);
  return variables
    .flatMap((variable) => variable.references)
    .flatMap(({ identifier }) => {
      const { parent } = identifier;
      return parent.type === AST_NODE_TYPES.CallExpression && parent.callee === identifier
        ? [parent]
        : [];
    });
}

function startingFunction(sourceCode: SourceCode, fn: FunctionNode): FunctionNode | undefined {
  const outer = enclosingFunction(fn);
  if (outer === undefined) {
    return undefined;
  }
  if (isTimerCallback(fn) || isPromiseCallback(fn)) {
    return outer;
  }
  const calledHere = directCallsOf(sourceCode, fn).some(
    (call) => enclosingFunction(call) === outer,
  );
  return calledHere ? outer : undefined;
}

function ownerChain(sourceCode: SourceCode, node: TSESTree.Node): FunctionNode[] {
  const chain = [enclosingFunction(node)];
  for (const fn of chain) {
    if (fn === undefined || isEffectCallback(sourceCode, fn)) {
      break;
    }
    if (chain.length > MAX_OWNERS) {
      return [];
    }
    chain.push(startingFunction(sourceCode, fn));
  }
  const effect = chain.at(-1);
  return effect !== undefined && isEffectCallback(sourceCode, effect)
    ? chain.flatMap((fn) => fn ?? [])
    : [];
}

function isStateSetter(node: TSESTree.Node | undefined): boolean {
  return node?.type === AST_NODE_TYPES.Identifier && stateSetter.test(node.name);
}

function promiseOrigin(callback: FunctionNode): TSESTree.Node | undefined {
  const call = callback.parent;
  return call.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression
    ? call.callee.object
    : undefined;
}

function asyncOrigin({
  chain,
  anchor,
  awaitsIn,
}: SetterCall & Pick<State, 'awaitsIn'>): TSESTree.Node | undefined {
  for (const [index, fn] of chain.entries()) {
    const before = index === 0 ? anchor : (chain[index - 1] ?? anchor);
    const awaited = (awaitsIn.get(fn) ?? []).find((node) => node.range[0] < before.range[1]);
    if (awaited !== undefined) {
      return awaited;
    }
    if (isPromiseCallback(fn)) {
      return promiseOrigin(fn);
    }
  }
  return undefined;
}

function entryFor(state: State, effect: FunctionNode | undefined): Entry {
  const existing = state.effects.get(effect);
  if (existing !== undefined) {
    return existing;
  }
  const entry = { requested: false, firstAsync: undefined };
  state.effects.set(effect, entry);
  return entry;
}

function recordAsync(state: State, chain: FunctionNode[], origin: TSESTree.Node): void {
  const entry = entryFor(state, chain.at(-1));
  if (entry.firstAsync === undefined || origin.range[0] < entry.firstAsync.range[0]) {
    entry.firstAsync = origin;
  }
}

function checkSetterUse(state: State, chain: FunctionNode[], node: TSESTree.CallExpression): void {
  if (isStateSetter(node.callee)) {
    state.setterCalls.push({ chain, anchor: node });
  }
  if (
    promiseCallbacks.has(calleeNameOf(node.callee)) &&
    node.arguments.some(isStateSetter) &&
    node.callee.type === AST_NODE_TYPES.MemberExpression
  ) {
    recordAsync(state, chain, node.callee.object);
  }
}

function checkCall(context: Context, state: State, node: CallLike): void {
  const chain = ownerChain(context.sourceCode, node);
  if (chain.length === 0) {
    return;
  }
  if (sendsRequest(node)) {
    entryFor(state, chain.at(-1)).requested = true;
    context.report({ node, messageId: 'fetchInEffect' });
    return;
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    checkSetterUse(state, chain, node);
  }
}

function reportAsyncWork(context: Context, state: State): void {
  for (const setter of state.setterCalls) {
    const origin = asyncOrigin({ ...setter, awaitsIn: state.awaitsIn });
    if (origin !== undefined) {
      recordAsync(state, setter.chain, origin);
    }
  }
  for (const { requested, firstAsync } of state.effects.values()) {
    if (!requested && firstAsync !== undefined) {
      context.report({ node: firstAsync, messageId: 'asyncInEffect' });
    }
  }
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow fetching data inside useEffect',
    },
    schema: [],
    messages: {
      fetchInEffect:
        'Do not fetch data in `useEffect`: it races and caches nothing. Use `useQuery` or a route loader. An exception fits only when this request is not data for rendering (an analytics beacon).',
      asyncInEffect:
        'Do not load state asynchronously in `useEffect` (a state setter after `await` or in a `.then` callback): it races the render and nothing caches the result. Load data with `useQuery` or a route loader; run an action (a save, a clipboard write) in the event handler that causes it; redirect by rendering `<Navigate />`. An exception fits only when this effect only synchronizes with an external system.',
    },
  },
  create(context) {
    const state: State = { awaitsIn: new Map(), setterCalls: [], effects: new Map() };
    return {
      CallExpression(node: TSESTree.CallExpression) {
        checkCall(context, state, node);
      },
      NewExpression(node: TSESTree.NewExpression) {
        checkCall(context, state, node);
      },
      AwaitExpression(node: TSESTree.AwaitExpression) {
        const fn = enclosingFunction(node);
        state.awaitsIn.set(fn, [...(state.awaitsIn.get(fn) ?? []), node]);
      },
      'Program:exit'() {
        reportAsyncWork(context, state);
      },
    };
  },
};
