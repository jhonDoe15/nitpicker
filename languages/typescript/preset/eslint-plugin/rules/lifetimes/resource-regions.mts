import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, variableNamed, type Ranged, type SourceCode } from '../typed/node-views.mts';

export type ResourceRegion = {
  readonly variable: TSESLint.Scope.Variable;
  readonly region: TSESTree.Node;
  readonly owner: string;
};

const USING_KINDS = new Set(['using', 'await using']);
const DISPOSERS = new Set(['close', 'dispose', 'destroy', 'release', 'disconnect', 'end']);
const DECLARATION_OWNER = 'using declaration';
const FINALLY_OWNER = 'finally block';

function containsRange(outer: Ranged, inner: Ranged): boolean {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

function disposedIdentifier(statement: TSESTree.Statement): TSESTree.Identifier | undefined {
  if (statement.type !== AST_NODE_TYPES.ExpressionStatement) {
    return undefined;
  }
  const expression =
    statement.expression.type === AST_NODE_TYPES.AwaitExpression
      ? statement.expression.argument
      : statement.expression;
  const callee = expression.type === AST_NODE_TYPES.CallExpression ? expression.callee : undefined;
  return callee?.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    DISPOSERS.has(nameOf(callee.property) ?? '')
    ? callee.object
    : undefined;
}

export function usingRegions(
  sourceCode: SourceCode,
  declaration: TSESTree.VariableDeclaration,
): ResourceRegion[] {
  if (!USING_KINDS.has(declaration.kind)) {
    return [];
  }
  return sourceCode
    .getDeclaredVariables(declaration)
    .map((variable) => ({ variable, region: declaration.parent, owner: DECLARATION_OWNER }));
}

export function finallyRegions(
  sourceCode: SourceCode,
  statement: TSESTree.TryStatement,
): ResourceRegion[] {
  if (statement.finalizer === null) {
    return [];
  }
  return statement.finalizer.body
    .map(disposedIdentifier)
    .flatMap((identifier) => (identifier === undefined ? [] : [identifier]))
    .map((identifier) => variableNamed(sourceCode, identifier))
    .flatMap((variable) =>
      variable === undefined ||
      variable.defs.some((definition) => containsRange(statement.block, definition.name))
        ? []
        : [variable],
    )
    .map((variable) => ({ variable, region: statement.block, owner: FINALLY_OWNER }));
}

export function referencesIn({ variable, region }: ResourceRegion): TSESTree.Node[] {
  return variable.references
    .filter(({ init, identifier }) => !init && containsRange(region, identifier))
    .map(({ identifier }) => identifier);
}
