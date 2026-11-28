import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import type { FileContext } from '../../typed/node-views.mts';
import { nodesOutsideNestedFunctions } from '../react-effects.mts';
import { BROWSER_GLOBALS, isBrowserTestHook } from './reach/browser-hooks.mts';

type SourceCode = TSESLint.SourceCode;

const { ScopeType } = TSESLint.Scope;

const EQUALITY = new Set(['===', '!==', '==', '!=']);
const GLOBAL_THIS = new Set(['globalThis']);

function isGlobal(node: TSESTree.Node, names: ReadonlySet<string>, sourceCode: SourceCode) {
  return (
    node.type === AST_NODE_TYPES.Identifier &&
    names.has(node.name) &&
    (findVariable({ sourceCode }, node, node.name)?.defs.length ?? 0) === 0
  );
}

function globalThisMember(node: TSESTree.Node, sourceCode: SourceCode): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    BROWSER_GLOBALS.has(node.property.name) &&
    isGlobal(node.object, GLOBAL_THIS, sourceCode)
  );
}

function typeofGlobal(node: TSESTree.Node, sourceCode: SourceCode): boolean {
  return (
    node.type === AST_NODE_TYPES.UnaryExpression &&
    node.operator === 'typeof' &&
    (isGlobal(node.argument, BROWSER_GLOBALS, sourceCode) ||
      globalThisMember(node.argument, sourceCode))
  );
}

function inGlobalThis(node: TSESTree.Node, sourceCode: SourceCode): boolean {
  return (
    node.type === AST_NODE_TYPES.BinaryExpression &&
    node.operator === 'in' &&
    node.left.type === AST_NODE_TYPES.Literal &&
    typeof node.left.value === 'string' &&
    BROWSER_GLOBALS.has(node.left.value) &&
    isGlobal(node.right, GLOBAL_THIS, sourceCode)
  );
}

function isTypeofTest(node: TSESTree.Node, sourceCode: SourceCode): boolean {
  return (
    (node.type === AST_NODE_TYPES.BinaryExpression &&
      EQUALITY.has(node.operator) &&
      (typeofGlobal(node.left, sourceCode) || typeofGlobal(node.right, sourceCode))) ||
    inGlobalThis(node, sourceCode)
  );
}

function combinesTypeofTests(node: TSESTree.Node, sourceCode: SourceCode): boolean {
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

function isHookCall(node: TSESTree.Node, context: FileContext): boolean {
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    node.callee.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const { callee } = node;
  const scope = findVariable({ sourceCode: context.sourceCode }, callee, callee.name)?.scope.type;
  return (
    node.arguments.length === 0 &&
    (scope === ScopeType.module || scope === ScopeType.global) &&
    /^use[A-Z]/u.test(callee.name) &&
    isBrowserTestHook(context.filename, context.sourceCode, callee.name)
  );
}

function constInitializer(
  node: TSESTree.Identifier,
  sourceCode: SourceCode,
): { readonly init: TSESTree.Expression; readonly topLevel: boolean } | undefined {
  const declarator = findVariable({ sourceCode }, node, node.name)?.defs[0]?.node;
  if (
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    declarator.parent.kind !== 'const' ||
    declarator.init === null
  ) {
    return undefined;
  }
  return {
    init: declarator.init,
    topLevel: declarator.parent.parent.type === AST_NODE_TYPES.Program,
  };
}

function browserFlag(node: TSESTree.Node, context: FileContext): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier || !namesValue(node)) {
    return false;
  }
  const found = constInitializer(node, context.sourceCode);
  if (found === undefined) {
    return false;
  }
  return found.topLevel
    ? combinesTypeofTests(found.init, context.sourceCode)
    : isHookCall(found.init, context);
}

export function testsBrowser(node: TSESTree.Node, context: FileContext): boolean {
  return nodesOutsideNestedFunctions(node).some(
    (each) =>
      isTypeofTest(each, context.sourceCode) ||
      browserFlag(each, context) ||
      isHookCall(each, context),
  );
}
