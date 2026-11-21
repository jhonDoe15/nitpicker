import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  type RunnerApis,
  kindOfObject,
  propertyName,
} from '../../rules/runner-apis/runner-apis.mts';
import {
  chainOf,
  contains,
  variableNamed,
  type SourceCode,
} from '../../rules/typed/node-views.mts';

const WORKER_CALLS: Readonly<Record<string, string>> = {
  useFakeTimers: 'fake timers',
  setSystemTime: 'the fake clock',
  spyOn: 'a spy',
  stubGlobal: 'a stubbed global',
  stubEnv: 'a stubbed environment variable',
};
const RUNNER_KINDS = new Set(['vitest', 'jest']);
const MOCK_SETTERS = new Set([
  'mockImplementation',
  'mockImplementationOnce',
  'mockReturnValue',
  'mockReturnValueOnce',
  'mockResolvedValue',
  'mockResolvedValueOnce',
  'mockRejectedValue',
  'mockRejectedValueOnce',
]);

function isProcessMember(sourceCode: SourceCode, node: TSESTree.Node, name: string): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    node.object.name === 'process' &&
    (variableNamed(sourceCode, node.object)?.defs.length ?? 0) === 0 &&
    propertyName(node) === name
  );
}

export function envWrite(sourceCode: SourceCode, target: TSESTree.Node): boolean {
  return (
    target.type === AST_NODE_TYPES.MemberExpression &&
    (isProcessMember(sourceCode, target.object, 'env') ||
      isProcessMember(sourceCode, target, 'env'))
  );
}

function declaredOutside(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
  owner: TSESTree.Node,
): boolean {
  const definition = variableNamed(sourceCode, identifier)?.defs[0];
  return definition !== undefined && !contains(owner, definition.name);
}

function sharedMockSetter(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  owner: TSESTree.Node,
): boolean {
  const { callee } = call;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    MOCK_SETTERS.has(propertyName(callee) ?? '') &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    declaredOutside(sourceCode, callee.object, owner)
  );
}

function rootOf(node: TSESTree.Node): TSESTree.Node {
  const chain = chainOf(node, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression ? link.object : undefined,
  );
  return chain.at(-1) ?? node;
}

function spiesOnLocalObject(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  owner: TSESTree.Node,
): boolean {
  const target = call.arguments[0];
  const root = target === undefined ? undefined : rootOf(target);
  if (root?.type !== AST_NODE_TYPES.Identifier) {
    return true;
  }
  const definition = variableNamed(sourceCode, root)?.defs[0];
  return definition !== undefined && contains(owner, definition.name);
}

export function workerStateCall(
  apis: RunnerApis,
  sourceCode: SourceCode,
  { call, owner }: { readonly call: TSESTree.CallExpression; readonly owner: TSESTree.Node },
): string | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const method = propertyName(callee) ?? '';
  if (RUNNER_KINDS.has(kindOfObject(apis, callee.object) ?? '') && method in WORKER_CALLS) {
    return method === 'spyOn' && spiesOnLocalObject(sourceCode, call, owner)
      ? undefined
      : WORKER_CALLS[method];
  }
  if (isProcessMember(sourceCode, callee, 'chdir')) {
    return 'the working directory change';
  }
  return sharedMockSetter(sourceCode, call, owner)
    ? 'the implementation set on a mock declared outside the test'
    : undefined;
}
