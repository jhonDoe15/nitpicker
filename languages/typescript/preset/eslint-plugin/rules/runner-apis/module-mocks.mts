import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { type RunnerApis, kindOfObject, propertyName } from './runner-apis.mts';

export type ModuleMock = {
  readonly name: string | undefined;
  readonly source?: TSESTree.Node;
  readonly replacement: TSESTree.Node | undefined;
};
type CallKind = {
  readonly kind: string | undefined;
  readonly method?: string | undefined;
  readonly direct: boolean;
};

const MODULE_MOCKS: Readonly<Record<string, readonly string[]>> = {
  vitest: ['mock', 'doMock'],
  jest: ['mock', 'doMock', 'unstable_mockModule', 'setMock'],
  node: ['module'],
  testdouble: ['replace'],
  quibble: ['esm'],
};

const DIRECT_MODULE_MOCKS = new Set(['mockRequire', 'quibble']);

const LOADER_MOCKS: Readonly<Record<string, readonly string[]>> = {
  proxyquire: ['load'],
  esmock: ['strict', 'strictest', 'partial', 'p'],
};

const LOADER_MOCK_ARGUMENTS = { start: 1, end: 3 };

function mockedName(node: TSESTree.Node | undefined): string | undefined {
  const source = node?.type === AST_NODE_TYPES.ImportExpression ? node.source : node;
  return source?.type === AST_NODE_TYPES.Literal && typeof source.value === 'string'
    ? source.value
    : undefined;
}

function keyName(property: TSESTree.ObjectLiteralElement): string | undefined {
  if (property.type !== AST_NODE_TYPES.Property) {
    return undefined;
  }
  return property.key.type === AST_NODE_TYPES.Identifier && !property.computed
    ? property.key.name
    : mockedName(property.key);
}

function replacementOf(property: TSESTree.ObjectLiteralElement): TSESTree.Node {
  return property.type === AST_NODE_TYPES.Property ? property.value : property.argument;
}

function loaderMocks(call: TSESTree.CallExpression): ModuleMock[] {
  const { start, end } = LOADER_MOCK_ARGUMENTS;
  return call.arguments
    .slice(start, end)
    .filter((argument) => argument.type === AST_NODE_TYPES.ObjectExpression)
    .flatMap((argument) => argument.properties)
    .map((property) => ({ name: keyName(property), replacement: replacementOf(property) }));
}

function callKind(apis: RunnerApis, callee: TSESTree.Node): CallKind {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return { kind: apis.kinds.get(callee.name), direct: true };
  }
  const method = propertyName(callee);
  const kind =
    method === undefined || callee.type !== AST_NODE_TYPES.MemberExpression
      ? undefined
      : kindOfObject(apis, callee.object);
  return { kind, method, direct: false };
}

export function moduleMocks(apis: RunnerApis, call: TSESTree.CallExpression): ModuleMock[] {
  const { kind = '', method = '', direct } = callKind(apis, call.callee);
  const loader = LOADER_MOCKS[kind];
  if (loader !== undefined && (direct || loader.includes(method))) {
    return loaderMocks(call);
  }
  const mocksModule = direct ? DIRECT_MODULE_MOCKS.has(kind) : MODULE_MOCKS[kind]?.includes(method);
  const [source, replacement] = mocksModule === true ? call.arguments : [];
  return source === undefined ? [] : [{ name: mockedName(source), source, replacement }];
}
