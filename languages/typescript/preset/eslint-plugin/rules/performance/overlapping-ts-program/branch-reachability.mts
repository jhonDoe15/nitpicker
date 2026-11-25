import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../../analysis/ancestry.mts';
import { ASSERTION_WRAPPERS, outermostOf } from '../../typed/syntax-views.mts';
import type { BoundVariable } from './ts-program-calls.mts';

const EXIT_STATEMENTS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
]);

const CASE_EXITS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.BreakStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
]);

const BRANCH_ANCESTORS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.SwitchCase,
  AST_NODE_TYPES.CatchClause,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

function pathToUnit(node: TSESTree.Node, unit: TSESTree.Node): TSESTree.Node[] {
  const ancestors = ancestorsOf(node);
  const stop = ancestors.indexOf(unit);
  return [node, ...(stop === -1 ? ancestors : ancestors.slice(0, stop + 1))];
}

function statementsAfter(
  statements: readonly TSESTree.Statement[],
  node: TSESTree.Node,
): readonly TSESTree.Statement[] {
  const index = statements.findIndex((statement) => statement === node);
  return index === -1 ? [] : statements.slice(index);
}

function terminatesStatement(
  statement: TSESTree.Statement,
  exits: ReadonlySet<AST_NODE_TYPES>,
): boolean {
  if (exits.has(statement.type)) {
    return true;
  }
  if (statement.type === AST_NODE_TYPES.BlockStatement) {
    const last = statement.body.at(-1);
    return last !== undefined && terminatesStatement(last, exits);
  }
  if (statement.type === AST_NODE_TYPES.IfStatement && statement.alternate !== null) {
    return (
      terminatesStatement(statement.consequent, exits) &&
      terminatesStatement(statement.alternate, exits)
    );
  }
  return false;
}

function terminatesCase(switchCase: TSESTree.SwitchCase): boolean {
  const last = switchCase.consequent.at(-1);
  return last !== undefined && terminatesStatement(last, CASE_EXITS);
}

function exitsBeforeLca(path: readonly TSESTree.Node[], lcaIndex: number): boolean {
  for (let index = 1; index < lcaIndex; index += 1) {
    const parent = path[index];
    const child = path[index - 1];
    if (parent?.type !== AST_NODE_TYPES.BlockStatement || child === undefined) {
      continue;
    }
    const remaining = statementsAfter(parent.body, child);
    if (remaining.some((statement) => terminatesStatement(statement, EXIT_STATEMENTS))) {
      return true;
    }
  }
  return false;
}

function areMutuallyExclusiveBranches(
  lca: TSESTree.Node,
  firstChild: TSESTree.Node,
  secondChild: TSESTree.Node,
): boolean {
  if (
    (lca.type === AST_NODE_TYPES.IfStatement ||
      lca.type === AST_NODE_TYPES.ConditionalExpression) &&
    firstChild === lca.consequent &&
    secondChild === lca.alternate
  ) {
    return true;
  }
  return (
    lca.type === AST_NODE_TYPES.SwitchStatement &&
    firstChild.type === AST_NODE_TYPES.SwitchCase &&
    secondChild.type === AST_NODE_TYPES.SwitchCase &&
    firstChild !== secondChild &&
    terminatesCase(firstChild)
  );
}

export function canReachSequentially(
  first: TSESTree.Node,
  second: TSESTree.Node,
  unit: TSESTree.Node,
): boolean {
  const firstPath = pathToUnit(first, unit);
  const secondPath = pathToUnit(second, unit);
  const secondSet = new Set(secondPath);
  const lcaIndex = firstPath.findIndex((node) => secondSet.has(node));
  if (lcaIndex <= 0) {
    return true;
  }
  const lca = firstPath[lcaIndex];
  const firstChild = firstPath[lcaIndex - 1];
  const secondChild = lca === undefined ? undefined : secondPath[secondPath.indexOf(lca) - 1];
  if (lca === undefined || firstChild === undefined || secondChild === undefined) {
    return true;
  }
  return (
    !areMutuallyExclusiveBranches(lca, firstChild, secondChild) &&
    !exitsBeforeLca(firstPath, lcaIndex)
  );
}

function isAssignmentOf(
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
  expression: TSESTree.Expression,
): boolean {
  const outer = outermostOf(expression, ASSERTION_WRAPPERS);
  const { parent } = outer;
  return (
    parent?.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.operator === '=' &&
    parent.right === outer &&
    parent.left === identifier
  );
}

function isUnconditionalBefore(
  writeNode: TSESTree.Node,
  target: TSESTree.Node,
  unit: TSESTree.Node,
): boolean {
  const writePath = pathToUnit(writeNode, unit);
  const targetSet = new Set(pathToUnit(target, unit));
  const lcaIndex = writePath.findIndex((node) => targetSet.has(node));
  if (lcaIndex <= 0) {
    return false;
  }
  return writePath.slice(1, lcaIndex).every((node) => !BRANCH_ANCESTORS.has(node.type));
}

function isOverwrittenByOrBefore(
  binding: BoundVariable,
  secondCall: TSESTree.CallExpression,
  unit: TSESTree.Node,
): boolean {
  for (const reference of binding.variable.references) {
    if (!reference.isWrite() || reference.init) {
      continue;
    }
    const { identifier } = reference;
    if (identifier.range[0] <= binding.pos) {
      continue;
    }
    if (isAssignmentOf(identifier, secondCall)) {
      return true;
    }
    if (
      identifier.range[1] < secondCall.range[0] &&
      isUnconditionalBefore(identifier, secondCall, unit)
    ) {
      return true;
    }
  }
  return false;
}

function isTypeQuery(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some((ancestor) => ancestor.type === AST_NODE_TYPES.TSTypeQuery);
}

export function hasLiveReadAfter(
  binding: BoundVariable,
  secondCall: TSESTree.CallExpression,
  unit: TSESTree.Node,
): boolean {
  if (isOverwrittenByOrBefore(binding, secondCall, unit)) {
    return false;
  }
  return binding.variable.references.some(
    (reference) =>
      reference.isRead() &&
      reference.isValueReference &&
      reference.identifier.range[0] > secondCall.range[1] &&
      !isTypeQuery(reference.identifier),
  );
}
