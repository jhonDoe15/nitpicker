import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf,
  constantInitializer,
  isNode,
  nameOf,
  type SourceCode,
} from '../../typed/node-views.mts';

type Guard = { readonly sourceCode: SourceCode; readonly name: string };

const EXIT_STATEMENTS = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.BreakStatement,
]);

const ERROR_CLASS = /^\w*(?:Error|Exception)$/;

function className(expression: TSESTree.Node): string | undefined {
  if (expression.type === AST_NODE_TYPES.Identifier) {
    return expression.name;
  }
  return expression.type === AST_NODE_TYPES.MemberExpression && !expression.computed
    ? nameOf(expression.property)
    : undefined;
}

function isInstanceofOf(expression: TSESTree.Node, name: string): boolean {
  return (
    expression.type === AST_NODE_TYPES.BinaryExpression &&
    expression.operator === 'instanceof' &&
    expression.left.type === AST_NODE_TYPES.Identifier &&
    expression.left.name === name &&
    ERROR_CLASS.test(className(expression.right) ?? '')
  );
}

function isInstanceofTest(guard: Guard, expression: TSESTree.Node): boolean {
  if (isInstanceofOf(expression, guard.name)) {
    return true;
  }
  const initializer =
    expression.type === AST_NODE_TYPES.Identifier
      ? constantInitializer(guard.sourceCode, expression)
      : undefined;
  return initializer !== undefined && isInstanceofOf(initializer, guard.name);
}

function operandsOf(expression: TSESTree.Node, operator: string): TSESTree.Node[] {
  const pending = [expression];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.LogicalExpression && current.operator === operator) {
      pending.push(current.left, current.right);
    }
  }
  return pending;
}

function provesInstance(guard: Guard, expression: TSESTree.Node): boolean {
  return operandsOf(expression, '&&').some((operand) => isInstanceofTest(guard, operand));
}

function provesNotInstance(guard: Guard, expression: TSESTree.Node): boolean {
  return operandsOf(expression, '||').some(
    (operand) =>
      operand.type === AST_NODE_TYPES.UnaryExpression &&
      operand.operator === '!' &&
      provesInstance(guard, operand.argument),
  );
}

function exits(statement: TSESTree.Node): boolean {
  const chain = [statement];
  for (const current of chain) {
    const last = current.type === AST_NODE_TYPES.BlockStatement ? current.body.at(-1) : undefined;
    if (last !== undefined) {
      chain.push(last);
    }
  }
  return EXIT_STATEMENTS.has(chain.at(-1)?.type ?? '');
}

function isEarlierExitGuard(guard: Guard, statement: TSESTree.Node): boolean {
  return (
    statement.type === AST_NODE_TYPES.IfStatement &&
    statement.alternate === null &&
    provesNotInstance(guard, statement.test) &&
    exits(statement.consequent)
  );
}

function isTrueSwitchCase(
  guard: Guard,
  parent: TSESTree.SwitchCase,
  child: TSESTree.Node,
): boolean {
  return (
    parent.consequent.some((each) => each === child) &&
    parent.test !== null &&
    parent.parent.discriminant.type === AST_NODE_TYPES.Literal &&
    parent.parent.discriminant.value === true &&
    provesInstance(guard, parent.test)
  );
}

function guardsBranch(
  guard: Guard,
  parent: TSESTree.IfStatement | TSESTree.ConditionalExpression,
  child: TSESTree.Node,
): boolean {
  if (parent.consequent === child) {
    return provesInstance(guard, parent.test);
  }
  return parent.alternate === child && provesNotInstance(guard, parent.test);
}

function guardsChild(guard: Guard, parent: TSESTree.Node, child: TSESTree.Node): boolean {
  if (parent.type === AST_NODE_TYPES.LogicalExpression && parent.right === child) {
    return parent.operator === '&&'
      ? provesInstance(guard, parent.left)
      : parent.operator === '||' && provesNotInstance(guard, parent.left);
  }
  if (
    parent.type === AST_NODE_TYPES.IfStatement ||
    parent.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return guardsBranch(guard, parent, child);
  }
  if (parent.type === AST_NODE_TYPES.SwitchCase) {
    return isTrueSwitchCase(guard, parent, child);
  }
  const statements: readonly TSESTree.Node[] =
    'body' in parent && Array.isArray(parent.body) ? parent.body : [];
  return statements
    .slice(0, statements.indexOf(child))
    .some((statement) => isEarlierExitGuard(guard, statement));
}

export function isNarrowedByInstanceof(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  name: string,
): boolean {
  const guard = { sourceCode, name };
  return [node, ...ancestorsOf(node)].some(
    (current) => isNode(current.parent) && guardsChild(guard, current.parent, current),
  );
}
