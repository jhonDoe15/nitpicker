import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { staticTextOf } from '../../typed/static-text.mts';
import { isFunction } from '../../typed/syntax-views.mts';

const listMethods = new Set(['map', 'flatMap']);
const equalityOperators = new Set(['==', '===', '!=', '!==']);

export function literalText(node: TSESTree.Node | undefined): string | undefined {
  return staticTextOf(
    node?.type === AST_NODE_TYPES.JSXExpressionContainer ? node.expression : node,
  );
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
  const pending = [test];
  for (const current of pending) {
    if (
      current.type === AST_NODE_TYPES.BinaryExpression &&
      equalityOperators.has(current.operator)
    ) {
      return true;
    }
    if (current.type === AST_NODE_TYPES.LogicalExpression) {
      pending.push(current.left, current.right);
    }
  }
  return false;
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
