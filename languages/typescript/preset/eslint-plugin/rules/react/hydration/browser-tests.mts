import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { nodesOutsideNestedFunctions } from '../react-effects.mts';

const BROWSER_GLOBALS = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'matchMedia',
]);
const EQUALITY = new Set(['===', '!==', '==', '!=']);

function typeofGlobal(node: TSESTree.Node, sourceCode: TSESLint.SourceCode): boolean {
  return (
    node.type === AST_NODE_TYPES.UnaryExpression &&
    node.operator === 'typeof' &&
    node.argument.type === AST_NODE_TYPES.Identifier &&
    BROWSER_GLOBALS.has(node.argument.name) &&
    (findVariable({ sourceCode }, node.argument, node.argument.name)?.defs.length ?? 0) === 0
  );
}

function isTypeofTest(node: TSESTree.Node, sourceCode: TSESLint.SourceCode): boolean {
  return (
    node.type === AST_NODE_TYPES.BinaryExpression &&
    EQUALITY.has(node.operator) &&
    (typeofGlobal(node.left, sourceCode) || typeofGlobal(node.right, sourceCode))
  );
}

function combinesTypeofTests(node: TSESTree.Node, sourceCode: TSESLint.SourceCode): boolean {
  const pending = [node];
  for (const each of pending) {
    if (each.type === AST_NODE_TYPES.LogicalExpression) {
      pending.push(each.left, each.right);
    } else if (each.type === AST_NODE_TYPES.UnaryExpression && each.operator === '!') {
      pending.push(each.argument);
    } else if (!isTypeofTest(each, sourceCode)) {
      return false;
    }
  }
  return true;
}

function namesValue(node: TSESTree.Identifier): boolean {
  const { parent } = node;
  return !(
    (parent.type === AST_NODE_TYPES.MemberExpression &&
      parent.property === node &&
      !parent.computed) ||
    (parent.type === AST_NODE_TYPES.Property && parent.key === node && !parent.computed)
  );
}

function moduleBrowserFlag(node: TSESTree.Node, sourceCode: TSESLint.SourceCode): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier || !namesValue(node)) {
    return false;
  }
  const definition = findVariable({ sourceCode }, node, node.name)?.defs[0];
  const declarator = definition?.node;
  return (
    declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.parent.kind === 'const' &&
    declarator.parent.parent.type === AST_NODE_TYPES.Program &&
    declarator.init !== null &&
    combinesTypeofTests(declarator.init, sourceCode)
  );
}

export function testsBrowser(node: TSESTree.Node, sourceCode: TSESLint.SourceCode): boolean {
  return nodesOutsideNestedFunctions(node).some(
    (each) => isTypeofTest(each, sourceCode) || moduleBrowserFlag(each, sourceCode),
  );
}
