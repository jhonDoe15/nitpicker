import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { hookName, isFunctionNode } from '../react-effects.mts';
import { functionLabel } from '../support/component-names.mts';

const STATE_HOOKS = new Set<string | undefined>(['useState', 'useRef']);

function isStateHook(hook: string | undefined): boolean {
  return STATE_HOOKS.has(hook);
}

type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;

const cheapCalls = new Set([
  'Boolean',
  'String',
  'Number',
  'BigInt',
  'Symbol',
  'parseInt',
  'parseFloat',
  'createSearchParams',
  'createRef',
]);
const cheapConstructors = new Set([
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Date',
  'Array',
  'Object',
  'RegExp',
  'Error',
  'Value',
  'ValueXY',
  'AbortController',
  'Promise',
  'URLSearchParams',
  'Headers',
  'FormData',
  'EventTarget',
]);
const cheapNamespaces = new Set(['Math', 'Number', 'Array', 'Object', 'Date', 'performance']);
const storageOwners = new Set(['localStorage', 'sessionStorage']);
const workVerbs = 'parse|compute|calculate|build|create|generate|load|read|decode|deserialize';
const expensiveName = new RegExp(
  `^(?:${workVerbs}|clone|structuredClone|init|make|randomUUID)(?![a-z])`,
  'u',
);
const serverFile = /(?:^|[/.-])server(?:[/.-]|$)/u;
const statefulFactories = new Set([
  'createBrowserRouter',
  'createMemoryRouter',
  'createHashRouter',
  'createStore',
  'configureStore',
]);
const hookCall = /^use[A-Z0-9]/u;
const componentName = /^(?:[A-Z]|use[A-Z0-9])/u;
const conditionalKinds = new Set([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
]);

function calleeParts(callee: TSESTree.Node): {
  owner?: string | undefined;
  name?: string | undefined;
} {
  const target = unwrapped(callee);
  if (target.type === AST_NODE_TYPES.Identifier) {
    return { name: target.name };
  }
  if (target.type === AST_NODE_TYPES.MemberExpression && !target.computed) {
    const owner = target.object.type === AST_NODE_TYPES.Identifier ? target.object.name : undefined;
    return owner === undefined
      ? { name: nameOf(target.property) }
      : { owner, name: nameOf(target.property) };
  }
  return {};
}

function isExpensive(node: CallLike): boolean {
  const { owner, name } = calleeParts(node.callee);
  if (name === undefined) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return !cheapConstructors.has(name);
  }
  if (cheapCalls.has(name) || hookCall.test(name) || cheapNamespaces.has(owner ?? '')) {
    return false;
  }
  return expensiveName.test(name) || storageOwners.has(owner ?? '');
}

function eagerArgument(call: TSESTree.CallExpression): CallLike | undefined {
  const [argument] = call.arguments;
  const value = argument === undefined ? undefined : unwrapped(argument);
  const isCall =
    value?.type === AST_NODE_TYPES.CallExpression || value?.type === AST_NODE_TYPES.NewExpression;
  return isCall && isExpensive(value) ? value : undefined;
}

function isBodyLevel(node: TSESTree.Node, filename: string): boolean {
  const chain = ancestorsOf(node);
  const owner = chain.find(isFunctionNode);
  const label = owner === undefined ? undefined : functionLabel(owner);
  if (owner === undefined || label === undefined || !componentName.test(label)) {
    return false;
  }
  if (owner.async || serverFile.test(filename)) {
    return false;
  }
  const inner = chain.slice(0, chain.indexOf(owner));
  return !inner.some((ancestor) => conditionalKinds.has(ancestor.type));
}

export const rule: TSESLint.RuleModule<'eagerInitial' | 'recreated'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow state, ref and store initial values built on every render' },
    schema: [],
    messages: {
      eagerInitial:
        '`{{hook}}` uses only its first value, but this argument is built on every render and thrown ' +
        'away after the first. Pass a function (`useState(() => ...)`) or create it lazily ' +
        '(`useRef<T | null>(null)`, fill it on first use).',
      recreated:
        '`{{name}}` runs on every render of this component and the result is thrown away or ' +
        'replaces the last one. Create it once: `useState(() => {{name}}(...))[0]`, `useMemo`, or ' +
        'at module level.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const hook = hookName(sourceCode, node.callee);
        if (isStateHook(hook) && eagerArgument(node) !== undefined) {
          context.report({ node, messageId: 'eagerInitial', data: { hook } });
          return;
        }
        const { name } = calleeParts(node.callee);
        const parentHook =
          node.parent.type === AST_NODE_TYPES.CallExpression
            ? hookName(sourceCode, node.parent.callee)
            : undefined;
        if (
          name !== undefined &&
          statefulFactories.has(name) &&
          !isStateHook(parentHook) &&
          isBodyLevel(node, context.filename)
        ) {
          context.report({ node, messageId: 'recreated', data: { name } });
        }
      },
      NewExpression(node: TSESTree.NewExpression) {
        const { name } = calleeParts(node.callee);
        const parent = node.parent;
        const parentHook =
          parent.type === AST_NODE_TYPES.CallExpression
            ? hookName(sourceCode, parent.callee)
            : undefined;
        if (
          name === 'QueryClient' &&
          !isStateHook(parentHook) &&
          isBodyLevel(node, context.filename)
        ) {
          context.report({ node, messageId: 'recreated', data: { name: 'new QueryClient' } });
        }
      },
    };
  },
};
