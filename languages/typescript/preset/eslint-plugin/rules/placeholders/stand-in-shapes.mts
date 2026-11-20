import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf } from '../typed/node-views.mts';
import { unwrapOf, TYPE_WRAPPERS } from '../typed/syntax-views.mts';

export type Shape = 'literal' | 'data' | 'delay' | 'copy' | 'empty';

const DELAY_NAMES = new Set(['sleep', 'delay', 'wait', 'setTimeout']);

function plain(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, TYPE_WRAPPERS);
}

function fixedProperties(node: TSESTree.ObjectExpression): TSESTree.Node[] | undefined {
  const values = node.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.Property && !property.computed ? [property.value] : [],
  );
  return values.length === node.properties.length ? values : undefined;
}

function fixedElements(node: TSESTree.ArrayExpression): TSESTree.Node[] | undefined {
  const values = node.elements.flatMap((element) =>
    element === null || element.type === AST_NODE_TYPES.SpreadElement ? [] : [element],
  );
  return values.length === node.elements.length ? values : undefined;
}

function isFixedLeaf(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return node.operator === '-' && node.argument.type === AST_NODE_TYPES.Literal;
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions.length === 0;
  }
  return node.type === AST_NODE_TYPES.Literal;
}

function fixedParts(node: TSESTree.Node): TSESTree.Node[] | undefined {
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return fixedElements(node);
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return fixedProperties(node);
  }
  return isFixedLeaf(node) ? [] : undefined;
}

function isFixedValue(value: TSESTree.Node): boolean {
  const pending = [value];
  for (const item of pending) {
    const parts = fixedParts(plain(item));
    if (parts === undefined) {
      return false;
    }
    for (const part of parts) {
      pending.push(part);
    }
  }
  return true;
}

function isCollection(value: TSESTree.Node): boolean {
  const node = plain(value);
  return (
    (node.type === AST_NODE_TYPES.ArrayExpression && node.elements.length > 0) ||
    (node.type === AST_NODE_TYPES.ObjectExpression && node.properties.length > 0)
  );
}

function memberObject(node: TSESTree.Node): TSESTree.Node | undefined {
  return node.type === AST_NODE_TYPES.MemberExpression && !node.computed
    ? plain(node.object)
    : undefined;
}

function isReference(value: TSESTree.Node): boolean {
  const root = chainOf(plain(value), memberObject).at(-1);
  return root?.type === AST_NODE_TYPES.Identifier && root.name !== 'undefined';
}

function isTimerCall(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    DELAY_NAMES.has(node.callee.name)
  );
}

function timerPromise(node: TSESTree.Node): boolean {
  const executor = node.type === AST_NODE_TYPES.NewExpression ? node.arguments[0] : undefined;
  return (
    node.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Promise' &&
    executor?.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    isTimerCall(executor.body)
  );
}

function isDelay(expression: TSESTree.Expression): boolean {
  if (expression.type !== AST_NODE_TYPES.AwaitExpression) {
    return false;
  }
  return timerPromise(expression.argument) || isTimerCall(expression.argument);
}

function declaredShape(statement: TSESTree.VariableDeclaration): Shape | undefined {
  const init = statement.declarations.length === 1 ? statement.declarations[0].init : undefined;
  if (init === undefined || init === null) {
    return undefined;
  }
  if (isCollection(init) && isFixedValue(init)) {
    return 'data';
  }
  return isReference(init) ? 'copy' : undefined;
}

function expressionShape(expression: TSESTree.Expression): Shape | undefined {
  if (isDelay(expression)) {
    return 'delay';
  }
  return expression.type === AST_NODE_TYPES.AssignmentExpression &&
    expression.operator === '=' &&
    isReference(expression.left) &&
    isReference(expression.right)
    ? 'copy'
    : undefined;
}

/** The kind of stand-in a statement is by its shape alone, if it is one. */
export function standInShape(statement: TSESTree.Node): Shape | undefined {
  if (statement.type === AST_NODE_TYPES.ReturnStatement) {
    return statement.argument !== null && isFixedValue(statement.argument) ? 'literal' : undefined;
  }
  if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
    return declaredShape(statement);
  }
  return statement.type === AST_NODE_TYPES.ExpressionStatement
    ? expressionShape(statement.expression)
    : undefined;
}
