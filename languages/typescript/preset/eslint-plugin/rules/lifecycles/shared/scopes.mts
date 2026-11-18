import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, depthFirst, nameOf } from '../../typed/node-views.mts';
import { childrenOf } from '../scope/close-owners.mts';
import { functionName, isFunctionNode, type FunctionNode } from '../scope/close-scopes.mts';

const LOOPS = new Set<string>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);
const ITERATORS = new Set<string>([
  'forEach',
  'map',
  'flatMap',
  'filter',
  'reduce',
  'some',
  'every',
]);
const HOOK_NAME = /^use[A-Z]/u;
const COMPONENT_NAME = /^[A-Z]/u;

export function nearestFunction(node: TSESTree.Node): FunctionNode | undefined {
  return ancestorsOf(node).find(isFunctionNode);
}

export function nearestClass(node: TSESTree.Node): TSESTree.ClassBody | undefined {
  return ancestorsOf(node).find(
    (ancestor): ancestor is TSESTree.ClassBody => ancestor.type === AST_NODE_TYPES.ClassBody,
  );
}

export function isMethodFunction(fn: FunctionNode): boolean {
  return (
    fn.parent.type === AST_NODE_TYPES.MethodDefinition ||
    (fn.parent.type === AST_NODE_TYPES.PropertyDefinition && fn.parent.value === fn)
  );
}

export function isConstructorFunction(fn: FunctionNode): boolean {
  return fn.parent.type === AST_NODE_TYPES.MethodDefinition && fn.parent.kind === 'constructor';
}

export function enclosingMethod(node: TSESTree.Node): FunctionNode | undefined {
  const functions = ancestorsOf(node).filter(isFunctionNode);
  const outerMost = functions.findLast((fn) => isMethodFunction(fn));
  return outerMost;
}

export function insideLoop(node: TSESTree.Node, boundary: TSESTree.Node): boolean {
  for (const ancestor of ancestorsOf(node)) {
    if (ancestor === boundary) {
      return false;
    }
    if (LOOPS.has(ancestor.type)) {
      return true;
    }
    if (
      isFunctionNode(ancestor) &&
      ancestor.parent.type === AST_NODE_TYPES.CallExpression &&
      ancestor.parent.callee.type === AST_NODE_TYPES.MemberExpression &&
      ITERATORS.has(nameOf(ancestor.parent.callee.property) ?? '')
    ) {
      return true;
    }
  }
  return false;
}

export function callsIn(root: TSESTree.Node): TSESTree.CallExpression[] {
  return [...depthFirst(root, childrenOf)].filter(
    (node): node is TSESTree.CallExpression => node.type === AST_NODE_TYPES.CallExpression,
  );
}

export function calleeProperty(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed) {
    return nameOf(callee.property);
  }
  return callee.type === AST_NODE_TYPES.Identifier ? callee.name : undefined;
}

export function isHookName(name: string | undefined): boolean {
  return name !== undefined && HOOK_NAME.test(name);
}

export function isComponentOrHook(fn: FunctionNode): boolean {
  const name = functionName(fn);
  if (name === undefined || isMethodFunction(fn)) {
    return false;
  }
  if (isHookName(name)) {
    return true;
  }
  return (
    COMPONENT_NAME.test(name) &&
    [...depthFirst(fn.body, childrenOf)].some(
      (node) =>
        node.type === AST_NODE_TYPES.JSXElement ||
        node.type === AST_NODE_TYPES.JSXFragment ||
        (node.type === AST_NODE_TYPES.CallExpression && isHookName(calleeProperty(node))),
    )
  );
}

export function hookCallbackOf(fn: FunctionNode): string | undefined {
  const { parent } = fn;
  return parent.type === AST_NODE_TYPES.CallExpression && parent.arguments[0] === fn
    ? calleeProperty(parent)
    : undefined;
}

export function reactComponent(node: TSESTree.Node): FunctionNode | undefined {
  return ancestorsOf(node)
    .filter(isFunctionNode)
    .find((fn) => isComponentOrHook(fn));
}
