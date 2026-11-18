import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';

const listMethods = new Set(['map', 'flatMap']);
const equalityOperators = new Set(['==', '===', '!=', '!==']);

export function literalText(node: TSESTree.Node | null | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.JSXExpressionContainer) {
    return literalText(node.expression);
  }
  if (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  return node?.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0
    ? (node.quasis[0]?.value.cooked ?? undefined)
    : undefined;
}

function isListCallback(node: TSESTree.Node): boolean {
  const call = node.parent;
  if (!isFunction(node) || call?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = call;
  const method =
    callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
      ? nameOf(callee.property)
      : undefined;
  return (
    (method !== undefined && listMethods.has(method) && call.arguments[0] === node) ||
    (method === 'from' &&
      callee.type === AST_NODE_TYPES.MemberExpression &&
      nameOf(callee.object) === 'Array' &&
      call.arguments[1] === node)
  );
}

function testsEquality(test: TSESTree.Node): boolean {
  if (test.type === AST_NODE_TYPES.BinaryExpression) {
    return equalityOperators.has(test.operator);
  }
  return (
    test.type === AST_NODE_TYPES.LogicalExpression &&
    (testsEquality(test.left) || testsEquality(test.right))
  );
}

function isDispatchBranch(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.SwitchCase) {
    return true;
  }
  return (
    (node.type === AST_NODE_TYPES.IfStatement ||
      node.type === AST_NODE_TYPES.ConditionalExpression) &&
    testsEquality(node.test)
  );
}

export function isRenderedPerItem(element: TSESTree.Node): boolean {
  const chain = ancestorsOf(element);
  const index = chain.findIndex(isListCallback);
  return index >= 0 && !chain.slice(0, index).some(isDispatchBranch);
}

function exportedNames(statement: TSESTree.ExportNamedDeclaration): (string | undefined)[] {
  const declaration = statement.declaration;
  if (declaration?.type === AST_NODE_TYPES.FunctionDeclaration) {
    return [nameOf(declaration.id)];
  }
  return declaration?.type === AST_NODE_TYPES.VariableDeclaration
    ? declaration.declarations.map(({ id }) => nameOf(id))
    : statement.specifiers.map(({ local }) => nameOf(local));
}

function exportNameIn(statement: TSESTree.ProgramStatement, component: string): string | undefined {
  if (statement.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
    const declared = statement.declaration;
    return nameOf('id' in declared ? declared.id : declared) === component ? 'default' : undefined;
  }
  return statement.type === AST_NODE_TYPES.ExportNamedDeclaration &&
    exportedNames(statement).includes(component)
    ? component
    : undefined;
}

export function exportNameOf(program: TSESTree.Program, component: string): string | undefined {
  return program.body
    .map((statement) => exportNameIn(statement, component))
    .find((name) => name !== undefined);
}
