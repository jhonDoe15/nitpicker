import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { type RunnerApis, kindOfObject } from '../../rules/runner-apis/runner-apis.mts';
import { chainOf } from '../../rules/typed/node-views.mts';
import { callbackOwner, isSuiteCall } from '../test-calls.mts';
import { isMockCreation } from './mock-sites.mts';

export type Context = Readonly<TSESLint.RuleContext<'sharedMock', []>>;
export type Shared = {
  readonly variable: TSESLint.Scope.Variable;
  readonly node: TSESTree.Node;
  readonly kind?: string | undefined;
};

export const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

function suiteBody(parent: TSESTree.Node): parent is TSESTree.BlockStatement {
  const owner = parent.parent;
  const call =
    owner !== undefined && FUNCTION_TYPES.has(owner.type) ? callbackOwner(owner) : undefined;
  return parent.type === AST_NODE_TYPES.BlockStatement && call !== undefined && isSuiteCall(call);
}

export function isSharedLevel(declaration: TSESTree.Node): boolean {
  const parent =
    declaration.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration
      ? declaration.parent.parent
      : declaration.parent;
  return parent?.type === AST_NODE_TYPES.Program || (parent !== undefined && suiteBody(parent));
}

function hoistedValue(
  apis: RunnerApis,
  init: TSESTree.Expression | undefined,
): TSESTree.Node | undefined {
  const callback =
    init?.type === AST_NODE_TYPES.CallExpression &&
    init.callee.type === AST_NODE_TYPES.MemberExpression &&
    kindOfObject(apis, init.callee.object) !== undefined
      ? init.arguments[0]
      : undefined;
  if (callback?.type !== AST_NODE_TYPES.ArrowFunctionExpression) {
    return undefined;
  }
  return callback.body.type === AST_NODE_TYPES.ObjectExpression ? callback.body : undefined;
}

function hoistedMocks(apis: RunnerApis, declarator: TSESTree.VariableDeclarator): string[] {
  const value = hoistedValue(apis, declarator.init ?? undefined);
  if (value?.type !== AST_NODE_TYPES.ObjectExpression) {
    return [];
  }
  return value.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.Property &&
    property.key.type === AST_NODE_TYPES.Identifier &&
    isMockCreation(apis, property.value)
      ? [property.key.name]
      : [],
  );
}

export function declaredMocks(
  context: Context,
  apis: RunnerApis,
  node: TSESTree.VariableDeclarator,
): Shared[] {
  const variables = context.sourceCode.getDeclaredVariables(node);
  if (node.id.type === AST_NODE_TYPES.Identifier) {
    const kind = isMockCreation(apis, node.init ?? undefined)
      ? mockKind(apis, node.init ?? undefined)
      : undefined;
    return kind === undefined
      ? []
      : variables.map((variable) => ({ variable, node: node.id, kind }));
  }
  const names = new Set(hoistedMocks(apis, node));
  return variables
    .filter((variable) => names.has(variable.name))
    .map((variable) => ({ variable, node: variable.defs[0]?.name ?? node, kind: 'vitest' }));
}

function mockKind(apis: RunnerApis, init: TSESTree.Node | undefined): string | undefined {
  const callees = chainOf<TSESTree.Node>(init, (current) =>
    current.type === AST_NODE_TYPES.CallExpression &&
    current.callee.type === AST_NODE_TYPES.MemberExpression
      ? current.callee.object
      : undefined,
  );
  return callees
    .map((call) =>
      call.type === AST_NODE_TYPES.CallExpression &&
      call.callee.type === AST_NODE_TYPES.MemberExpression
        ? kindOfObject(apis, call.callee.object)
        : undefined,
    )
    .find((kind) => kind !== undefined);
}
