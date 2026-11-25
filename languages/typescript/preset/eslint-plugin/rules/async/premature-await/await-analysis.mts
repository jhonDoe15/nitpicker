import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  type SourceCode,
  chainOf,
  contains,
  depthFirst,
  nameOf,
  nodeChildren,
  nodesWithoutNested,
  plainText,
  variableNamed,
} from '../../typed/node-views.mts';
import { TYPE_WRAPPERS, enclosingFunction, isCall, unwrapOf } from '../../typed/syntax-views.mts';

export type WaitBinding = {
  readonly statement: TSESTree.Statement;
  readonly target: TSESTree.Node;
  readonly variables: readonly TSESLint.Scope.Variable[];
};

const FUNCTION_BOUNDARIES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.StaticBlock,
]);

const IMPURE_EXPRESSION_TYPES = new Set<string>([
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.YieldExpression,
  AST_NODE_TYPES.TaggedTemplateExpression,
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.UpdateExpression,
]);

export function isInsideTryWithFinally(node: TSESTree.Node): boolean {
  const ancestors = chainOf<TSESTree.Node>(node, (current) =>
    FUNCTION_BOUNDARIES.has(current.type) ? undefined : current.parent,
  );
  return ancestors.some(
    (current) =>
      current.parent?.type === AST_NODE_TYPES.TryStatement &&
      current.parent.block === current &&
      current.parent.finalizer !== null,
  );
}

function taskRoot(node: TSESTree.Node): TSESTree.Node {
  const chain = chainOf<TSESTree.Node>(unwrapOf(node, TYPE_WRAPPERS), (link) =>
    link.type === AST_NODE_TYPES.MemberExpression
      ? unwrapOf(link.object, TYPE_WRAPPERS)
      : undefined,
  );
  return chain.at(-1) ?? node;
}

function isStartedTask(expression: TSESTree.Node): boolean {
  const target = unwrapOf(expression, TYPE_WRAPPERS);
  if (
    target.type !== AST_NODE_TYPES.Identifier &&
    target.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return false;
  }
  const root = taskRoot(target);
  const validRoot =
    root.type === AST_NODE_TYPES.Identifier || root.type === AST_NODE_TYPES.ThisExpression;
  return (
    validRoot &&
    ![...depthFirst(target, nodeChildren)].some((node) => IMPURE_EXPRESSION_TYPES.has(node.type))
  );
}

function declarationWait(
  sourceCode: SourceCode,
  statement: TSESTree.VariableDeclaration,
): WaitBinding | undefined {
  if (statement.declarations.length !== 1) {
    return undefined;
  }
  const [declarator] = statement.declarations;
  const init = declarator?.init ? unwrapOf(declarator.init, TYPE_WRAPPERS) : undefined;
  if (init?.type !== AST_NODE_TYPES.AwaitExpression || !isStartedTask(init.argument)) {
    return undefined;
  }
  const variables = sourceCode.getDeclaredVariables(statement);
  return variables.length > 0
    ? { statement, target: unwrapOf(init.argument, TYPE_WRAPPERS), variables }
    : undefined;
}

function assignmentWait(
  sourceCode: SourceCode,
  statement: TSESTree.ExpressionStatement,
): WaitBinding | undefined {
  const { expression } = statement;
  if (
    expression.type !== AST_NODE_TYPES.AssignmentExpression ||
    expression.operator !== '=' ||
    expression.left.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const right = unwrapOf(expression.right, TYPE_WRAPPERS);
  if (right.type !== AST_NODE_TYPES.AwaitExpression || !isStartedTask(right.argument)) {
    return undefined;
  }
  const variable = variableNamed(sourceCode, expression.left);
  return variable === undefined
    ? undefined
    : { statement, target: unwrapOf(right.argument, TYPE_WRAPPERS), variables: [variable] };
}

export function waitBindingOf(
  sourceCode: SourceCode,
  statement: TSESTree.Statement | undefined,
): WaitBinding | undefined {
  if (statement?.type === AST_NODE_TYPES.VariableDeclaration) {
    return declarationWait(sourceCode, statement);
  }
  if (statement?.type === AST_NODE_TYPES.ExpressionStatement) {
    return assignmentWait(sourceCode, statement);
  }
  return undefined;
}

function hasHoistedOrPriorClosureRead(
  variable: TSESLint.Scope.Variable,
  statement: TSESTree.Statement,
): boolean {
  const owner = enclosingFunction(statement);
  return variable.references.some((ref) => {
    const refOwner = enclosingFunction(ref.identifier);
    return (
      ref.isRead() &&
      refOwner !== owner &&
      (ref.identifier.range[0] < statement.range[0] ||
        refOwner?.type === AST_NODE_TYPES.FunctionDeclaration)
    );
  });
}

function firstReadOf(
  variable: TSESLint.Scope.Variable,
  waitStatement: TSESTree.Statement,
): TSESTree.Identifier | undefined {
  const afterRefs = variable.references
    .filter((ref) => ref.identifier.range[0] > waitStatement.range[1])
    .toSorted((left, right) => left.identifier.range[0] - right.identifier.range[0]);
  const [first] = afterRefs;
  return first?.isRead() && first.identifier.type === AST_NODE_TYPES.Identifier
    ? first.identifier
    : undefined;
}

export function firstReadStatementIndex(
  binding: WaitBinding,
  statements: readonly TSESTree.Statement[],
  waitIndex: number,
): number | undefined {
  if (
    binding.variables.some((variable) => hasHoistedOrPriorClosureRead(variable, binding.statement))
  ) {
    return undefined;
  }
  const firstReads = binding.variables
    .map((variable) => firstReadOf(variable, binding.statement))
    .filter((id): id is TSESTree.Identifier => id !== undefined)
    .toSorted((left, right) => left.range[0] - right.range[0]);
  const [earliest] = firstReads;
  if (earliest === undefined) {
    return undefined;
  }
  const index = statements.findIndex((stmt, idx) => idx > waitIndex && contains(stmt, earliest));
  return index === -1 ? undefined : index;
}

function hasCallInStatement(statement: TSESTree.Statement): boolean {
  if (FUNCTION_BOUNDARIES.has(statement.type)) {
    return false;
  }
  return nodesWithoutNested(statement, FUNCTION_BOUNDARIES, nodeChildren).some(isCall);
}

export function hasNonTrivialCall(statements: readonly TSESTree.Statement[]): boolean {
  return statements.some(hasCallInStatement);
}

export function mutatesTaskTarget(
  sourceCode: SourceCode,
  statements: readonly TSESTree.Statement[],
  target: TSESTree.Node,
): boolean {
  const rootName = nameOf(taskRoot(target));
  const targetText = plainText(target, sourceCode);
  return statements.some((statement) =>
    [...depthFirst(statement, nodeChildren)].some((node) => {
      if (node.type !== AST_NODE_TYPES.AssignmentExpression) {
        return false;
      }
      const left = unwrapOf(node.left, TYPE_WRAPPERS);
      return (
        (rootName !== undefined && nameOf(left) === rootName) ||
        plainText(left, sourceCode) === targetText
      );
    }),
  );
}
