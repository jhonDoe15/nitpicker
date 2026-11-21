import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  type RunnerApis,
  kindOfObject,
  propertyName,
} from '../../rules/runner-apis/runner-apis.mts';
import { chainOf } from '../../rules/typed/node-views.mts';

const MOCK_FACTORIES: Readonly<Record<string, readonly string[]>> = {
  vitest: ['fn', 'spyOn'],
  jest: ['fn', 'spyOn'],
  node: ['fn', 'method', 'getter', 'setter'],
};
const MODULE_MOCKS: Readonly<Record<string, readonly string[]>> = {
  vitest: ['mock', 'doMock'],
  jest: ['mock', 'doMock'],
};
const CLEARING_METHODS = new Set(['mockClear', 'mockReset', 'mockRestore', 'resetCalls']);
const CLEARING_ALL: Readonly<Record<string, readonly string[]>> = {
  vitest: ['clearAllMocks', 'resetAllMocks', 'restoreAllMocks'],
  jest: ['clearAllMocks', 'resetAllMocks', 'restoreAllMocks'],
  node: ['reset', 'restoreAll'],
};
const COUNT_MATCHERS = new Set([
  'toHaveBeenCalledTimes',
  'toBeCalledTimes',
  'toHaveBeenCalledOnce',
  'toHaveBeenNthCalledWith',
  'nthCalledWith',
]);
const NEGATED_MATCHERS = new Set(['toHaveBeenCalled', 'toBeCalled']);
const CALL_RECORDS = new Set(['calls', 'results', 'callCount']);
const MOCKED_WRAPPERS = new Set(['mocked']);

type Lists = Readonly<Record<string, readonly string[]>>;

function runnerMember(apis: RunnerApis, node: TSESTree.Node, lists: Lists): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const kind = kindOfObject(apis, node.object);
  const method = propertyName(node);
  return method !== undefined && lists[kind ?? '']?.includes(method) === true;
}

function runnerCall(apis: RunnerApis, node: TSESTree.Node, lists: Lists): boolean {
  return node.type === AST_NODE_TYPES.CallExpression && runnerMember(apis, node.callee, lists);
}

function chainRoot(node: TSESTree.Node): TSESTree.Node {
  const links = chainOf<TSESTree.Node>(node, (current) =>
    current.type === AST_NODE_TYPES.CallExpression &&
    current.callee.type === AST_NODE_TYPES.MemberExpression &&
    current.callee.object.type === AST_NODE_TYPES.CallExpression
      ? current.callee.object
      : undefined,
  );
  return links.at(-1) ?? node;
}

export function isMockCreation(apis: RunnerApis, node: TSESTree.Node | null | undefined): boolean {
  return node !== null && node !== undefined && runnerCall(apis, chainRoot(node), MOCK_FACTORIES);
}

export function mockedModule(
  apis: RunnerApis,
  node: TSESTree.CallExpression,
): { readonly source: string; readonly kind: string | undefined } | undefined {
  const [first] = node.arguments;
  return runnerCall(apis, node, MODULE_MOCKS) &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    first?.type === AST_NODE_TYPES.Literal &&
    typeof first.value === 'string'
    ? { source: first.value, kind: kindOfObject(apis, node.callee.object) }
    : undefined;
}

export function clearsEveryMock(apis: RunnerApis, node: TSESTree.CallExpression): boolean {
  return (
    runnerCall(apis, node, CLEARING_ALL) ||
    node.arguments.some((argument) => runnerMember(apis, argument, CLEARING_ALL))
  );
}

function withoutTypes(node: TSESTree.Node): TSESTree.Node {
  return node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion
    ? withoutTypes(node.expression)
    : node;
}

function unwrapMocked(apis: RunnerApis, wrapped: TSESTree.Node): TSESTree.Node {
  const node = withoutTypes(wrapped);
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    MOCKED_WRAPPERS.has(propertyName(node.callee) ?? '') &&
    kindOfObject(apis, node.callee.object) !== undefined &&
    node.arguments[0] !== undefined
  ) {
    return withoutTypes(node.arguments[0]);
  }
  return node;
}

function identifierName(apis: RunnerApis, node: TSESTree.Node | undefined): string | undefined {
  const target = node === undefined ? undefined : unwrapMocked(apis, node);
  return target?.type === AST_NODE_TYPES.Identifier ? target.name : undefined;
}

export function clearedMockName(
  apis: RunnerApis,
  node: TSESTree.CallExpression,
): string | null | undefined {
  const { callee } = node;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    !CLEARING_METHODS.has(propertyName(callee) ?? '')
  ) {
    return undefined;
  }
  const target =
    callee.object.type === AST_NODE_TYPES.MemberExpression && propertyName(callee.object) === 'mock'
      ? callee.object.object
      : callee.object;
  return identifierName(apis, target) ?? null;
}

function matcherOf(member: TSESTree.MemberExpression): { name: string; negated: boolean } {
  const negated =
    member.object.type === AST_NODE_TYPES.MemberExpression && propertyName(member.object) === 'not';
  return { name: propertyName(member) ?? '', negated };
}

function expectedName(apis: RunnerApis, member: TSESTree.MemberExpression): string | undefined {
  const base =
    member.object.type === AST_NODE_TYPES.MemberExpression && propertyName(member.object) === 'not'
      ? member.object.object
      : member.object;
  if (
    base.type !== AST_NODE_TYPES.CallExpression ||
    base.callee.type !== AST_NODE_TYPES.Identifier ||
    base.callee.name !== 'expect'
  ) {
    return undefined;
  }
  return identifierName(apis, base.arguments[0]);
}

export type CountRead = {
  readonly name: string;
  readonly node: TSESTree.Node;
  readonly form: string;
};

function matcherRead(apis: RunnerApis, node: TSESTree.MemberExpression): CountRead | undefined {
  const { name, negated } = matcherOf(node);
  const counts = COUNT_MATCHERS.has(name) || (negated && NEGATED_MATCHERS.has(name));
  const mock = counts ? expectedName(apis, node) : undefined;
  return mock === undefined
    ? undefined
    : { name: mock, node, form: negated ? `not.${name}` : name };
}

function recordRead(apis: RunnerApis, node: TSESTree.MemberExpression): CountRead | undefined {
  const record = propertyName(node);
  const mock = node.object;
  if (
    !CALL_RECORDS.has(record ?? '') ||
    mock.type !== AST_NODE_TYPES.MemberExpression ||
    propertyName(mock) !== 'mock'
  ) {
    return undefined;
  }
  const name = identifierName(apis, mock.object);
  return name === undefined ? undefined : { name, node, form: `mock.${record ?? ''}` };
}

export function countRead(
  apis: RunnerApis,
  node: TSESTree.MemberExpression,
): CountRead | undefined {
  return matcherRead(apis, node) ?? recordRead(apis, node);
}

export function resetCallFor(kind: string | undefined, name: string): string {
  return kind === 'node' ? `${name}.mock.resetCalls()` : `${name}.mockClear()`;
}
