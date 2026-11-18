import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  descendants,
  inReactTestFilesOnly,
  isReactExpression,
  reactBindingNames,
} from './react-test-files.mts';
import { moduleMocks } from '../runner-apis/module-mocks.mts';
import { type RunnerApis, runnerApisOf } from '../runner-apis/runner-apis.mts';
import { spiedMember } from '../runner-apis/runner-doubles.mts';
import { nameOf, type SourceCode } from '../typed/node-views.mts';

type MessageId = 'componentInternals' | 'fiberInternals' | 'reactMock' | 'hookSpy';

type FactoryBindings = {
  readonly functions: ReadonlySet<string>;
  readonly namespaces: ReadonlySet<string>;
};

type ImportedBindings = {
  readonly namespaces: readonly TSESTree.ImportClause[];
  readonly functions: readonly TSESTree.ImportClause[];
};

type Wrappers = { readonly bindings: FactoryBindings; readonly names: ReadonlySet<string> };

const instanceMethods = new Set([
  'instance',
  'getInstance',
  'state',
  'setState',
  'findByType',
  'findAllByType',
  'findByProps',
  'findAllByProps',
]);
const stateMethods = new Set(['state', 'setState']);
const wrapperFactories = new Map([
  ['enzyme', new Set(['mount', 'shallow', 'render'])],
  ['react-test-renderer', new Set(['create'])],
]);
const factoryNames = new Set([...wrapperFactories.values()].flatMap((names) => [...names]));
const fiberProperties = new Set([
  '_reactInternals',
  '_reactInternalFiber',
  'stateNode',
  'memoizedState',
  'memoizedProps',
]);
const fiberKeyPrefix = '__react';
const globalReactNames = ['React', 'react'];
const REACT_MODULE = 'react';
const hookNamePattern = /^use[A-Z]/;
const mockedModules = new Set(['react', 'react-dom']);

function literalTypeName(node: TSESTree.TSAsExpression): string | undefined {
  const literal =
    node.typeAnnotation.type === AST_NODE_TYPES.TSLiteralType ? node.typeAnnotation.literal : node;
  return literal.type === AST_NODE_TYPES.Literal && typeof literal.value === 'string'
    ? literal.value
    : undefined;
}

function plainName(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  return node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function staticName(node: TSESTree.Node): string | undefined {
  return node.type === AST_NODE_TYPES.TSAsExpression
    ? (literalTypeName(node) ?? plainName(node.expression))
    : plainName(node);
}

function memberName(node: TSESTree.MemberExpression): string | undefined {
  return node.computed ? staticName(node.property) : node.property.name;
}

function isFiberName(name: string | undefined): boolean {
  return name !== undefined && (fiberProperties.has(name) || name.startsWith(fiberKeyPrefix));
}

function spiedHook(
  node: TSESTree.CallExpression,
  { reactNames, apis }: { readonly reactNames: ReadonlySet<string>; readonly apis: RunnerApis },
): string | undefined {
  const spied = spiedMember(apis, node);
  const onReact = spied !== undefined && isReactExpression(spied.target, reactNames);
  const name = onReact ? staticName(spied.property) : undefined;
  return hookNamePattern.test(name ?? '') ? name : undefined;
}

function mockedHooks(
  factory: TSESTree.Node | undefined,
  visitorKeys: SourceCode['visitorKeys'],
): (string | undefined)[] {
  const keys = factory === undefined ? [] : descendants(factory, visitorKeys);
  return keys
    .filter((key) => key.type === AST_NODE_TYPES.Property)
    .map((key) => staticName(key.key))
    .filter((name) => hookNamePattern.test(name ?? ''));
}

function reactMock(
  node: TSESTree.CallExpression,
  {
    apis,
    visitorKeys,
  }: { readonly apis: RunnerApis; readonly visitorKeys: SourceCode['visitorKeys'] },
): string | undefined {
  const mock = moduleMocks(apis, node).find(
    ({ name }) => name !== undefined && mockedModules.has(name),
  );
  const hooks = mock === undefined ? [] : mockedHooks(mock.replacement, visitorKeys);
  if (hooks.length > 0) {
    return hooks.join('`, `');
  }
  return mock?.name === REACT_MODULE ? mock.name : undefined;
}

function importedBindings(statement: TSESTree.ImportDeclaration): ImportedBindings {
  const names = wrapperFactories.get(statement.source.value) ?? new Set<string>();
  const specifiers = statement.specifiers;
  return {
    namespaces: specifiers.filter(({ type }) => type !== AST_NODE_TYPES.ImportSpecifier),
    functions: specifiers.filter((specifier) => {
      const imported =
        specifier.type === AST_NODE_TYPES.ImportSpecifier ? nameOf(specifier.imported) : undefined;
      return imported !== undefined && names.has(imported);
    }),
  };
}

function factoryBindings(program: TSESTree.Program): FactoryBindings {
  const imports = program.body
    .filter(
      (statement): statement is TSESTree.ImportDeclaration =>
        statement.type === AST_NODE_TYPES.ImportDeclaration &&
        wrapperFactories.has(statement.source.value),
    )
    .map(importedBindings);
  return {
    functions: localNames(imports, 'functions'),
    namespaces: localNames(imports, 'namespaces'),
  };
}

function localNames(
  imports: readonly ImportedBindings[],
  key: keyof ImportedBindings,
): Set<string> {
  return new Set(imports.flatMap((found) => found[key].map(({ local }) => local.name)));
}

function calleeOf(node: TSESTree.Node | undefined): TSESTree.Node | undefined {
  const call = node?.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node;
  return call?.type === AST_NODE_TYPES.CallExpression || call?.type === AST_NODE_TYPES.NewExpression
    ? call.callee
    : undefined;
}

function isWrapperFactoryCall(node: TSESTree.Node | undefined, bindings: FactoryBindings): boolean {
  const callee = calleeOf(node);
  if (callee === undefined) {
    return false;
  }
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return bindings.functions.has(callee.name);
  }
  const name = callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    bindings.namespaces.has(callee.object.name) &&
    name !== undefined &&
    factoryNames.has(name)
  );
}

function wrapperNames(nodes: readonly TSESTree.Node[], bindings: FactoryBindings): Set<string> {
  const assigned = nodes.flatMap((node) => {
    if (
      node.type === AST_NODE_TYPES.VariableDeclarator &&
      node.id.type === AST_NODE_TYPES.Identifier
    ) {
      return isWrapperFactoryCall(node.init ?? undefined, bindings) ? [node.id.name] : [];
    }
    if (
      node.type === AST_NODE_TYPES.AssignmentExpression &&
      node.left.type === AST_NODE_TYPES.Identifier
    ) {
      return isWrapperFactoryCall(node.right, bindings) ? [node.left.name] : [];
    }
    return [];
  });
  return new Set(assigned);
}

function usesComponentInternals(
  callee: TSESTree.Node,
  method: string,
  wrappers: Wrappers,
): boolean {
  if (callee.type !== AST_NODE_TYPES.MemberExpression || !instanceMethods.has(method)) {
    return false;
  }
  if (!stateMethods.has(method)) {
    return true;
  }
  const receiver = callee.object;
  return (
    (receiver.type === AST_NODE_TYPES.Identifier && wrappers.names.has(receiver.name)) ||
    isWrapperFactoryCall(receiver, wrappers.bindings)
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow React component tests that depend on component or hook internals',
    },
    schema: [],
    messages: {
      componentInternals:
        'Do not use component state or instances ({{ name }}). Assert what the user sees with `screen.getByRole(...)`.',
      fiberInternals:
        'Do not read React internals ({{ name }}). Assert what the user sees with `screen.getByRole(...)`.',
      reactMock:
        'Do not replace `{{ name }}` with a module mock. Assert what the user sees with `screen.getByRole(...)`, or test a custom hook with `renderHook`.',
      hookSpy:
        'Do not spy on the React hook `{{ name }}`. Assert what the user sees with `screen.getByRole(...)`, or test a custom hook with `renderHook`.',
    },
  },
  create: inReactTestFilesOnly((context) => {
    const reactNames = reactBindingNames(context.sourceCode, globalReactNames);
    const bindings = factoryBindings(context.sourceCode.ast);
    const nodes = descendants(context.sourceCode.ast, context.sourceCode.visitorKeys);
    const wrappers = { bindings, names: wrapperNames(nodes, bindings) };
    const apis = runnerApisOf(context.sourceCode.ast);
    const visitorKeys = context.sourceCode.visitorKeys;
    return {
      CallExpression(node) {
        const callee = node.callee;
        const method =
          callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
        if (method !== undefined && usesComponentInternals(callee, method, wrappers)) {
          context.report({ node, messageId: 'componentInternals', data: { name: `${method}()` } });
        }
        const mocked = reactMock(node, { apis, visitorKeys });
        if (mocked !== undefined) {
          context.report({ node, messageId: 'reactMock', data: { name: mocked } });
        }
        const hook = spiedHook(node, { reactNames, apis });
        if (hook !== undefined) {
          context.report({ node, messageId: 'hookSpy', data: { name: hook } });
        }
      },
      MemberExpression(node) {
        const name = memberName(node);
        if (isFiberName(name)) {
          context.report({ node, messageId: 'fiberInternals', data: { name } });
        }
      },
    };
  }),
};
