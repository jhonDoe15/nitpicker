import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains } from '../analysis/ancestry.mts';
import { isFunctionNode } from '../analysis/constant-resolution.mts';
import { calleeName } from '../null-branches/branch-calls/leaving-calls.mts';
import { nodeChildren } from '../typed/node-views.mts';
import { preOrder } from '../../../../../../shared/traversal.mts';

type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

type WalkKind = 'listener' | 'visitor' | 'loop';

export type Walk = {
  readonly kind: WalkKind;
  readonly body: TSESTree.Node;
  readonly nodeName: string;
  readonly selector?: string;
};

const BROAD_SELECTORS = new Set([
  '*',
  'Identifier',
  'MemberExpression',
  'CallExpression',
  'NewExpression',
  'Property',
  'Literal',
  'BinaryExpression',
  'AssignmentExpression',
  'VariableDeclarator',
  'ImportSpecifier',
  'ExportSpecifier',
]);
const CHILD_WALKERS = new Set(['forEachChild', 'visitEachChild']);

function keyName(property: TSESTree.Property | TSESTree.MethodDefinition): string | undefined {
  const { key } = property;
  if (key.type === AST_NODE_TYPES.Identifier && !property.computed) {
    return key.name;
  }
  return key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string'
    ? key.value
    : undefined;
}

function returnedObjectOwner(object: TSESTree.ObjectExpression): TSESTree.Node | undefined {
  const { parent } = object;
  if (parent.type === AST_NODE_TYPES.ReturnStatement) {
    return ancestorsOf(parent).find((ancestor) => isFunctionNode(ancestor));
  }
  return isFunctionNode(parent) && parent.body === object ? parent : undefined;
}

function isCreateFunction(node: TSESTree.Node | undefined): boolean {
  const owner = node?.parent;
  if (owner?.type === AST_NODE_TYPES.Property || owner?.type === AST_NODE_TYPES.MethodDefinition) {
    return keyName(owner) === 'create';
  }
  return false;
}

function listenerSelector(fn: FunctionNode): string | undefined {
  const property = fn.parent;
  if (property.type !== AST_NODE_TYPES.Property || property.value !== fn) {
    return undefined;
  }
  const object = property.parent;
  if (object.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  const selector = keyName(property);
  return selector !== undefined &&
    BROAD_SELECTORS.has(selector) &&
    isCreateFunction(returnedObjectOwner(object))
    ? selector
    : undefined;
}

function isChildWalk(call: TSESTree.Node): call is TSESTree.CallExpression {
  return call.type === AST_NODE_TYPES.CallExpression && CHILD_WALKERS.has(calleeName(call) ?? '');
}

function functionName(fn: FunctionNode): string | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn.id?.name;
  }
  const { parent } = fn;
  return parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
    ? parent.id.name
    : undefined;
}

function walksItself(fn: FunctionNode, name: string): boolean {
  return preOrder(fn.body, nodeChildren).some(
    (node) =>
      isChildWalk(node) &&
      node.arguments.some((arg) => arg.type === AST_NODE_TYPES.Identifier && arg.name === name),
  );
}

function isVisitor(fn: FunctionNode): boolean {
  const { parent } = fn;
  if (isChildWalk(parent) && parent.arguments.some((arg) => arg === fn)) {
    return true;
  }
  const name = functionName(fn);
  return name !== undefined && walksItself(fn, name);
}

function firstParameterName(fn: FunctionNode): string | undefined {
  const [first] = fn.params;
  return first?.type === AST_NODE_TYPES.Identifier ? first.name : undefined;
}

function functionWalk(fn: FunctionNode): Walk | undefined {
  const nodeName = firstParameterName(fn);
  if (nodeName === undefined) {
    return undefined;
  }
  const selector = listenerSelector(fn);
  if (selector !== undefined) {
    return { kind: 'listener', body: fn.body, nodeName, selector };
  }
  return isVisitor(fn) ? { kind: 'visitor', body: fn.body, nodeName } : undefined;
}

function loopWalk(loop: TSESTree.ForOfStatement): Walk | undefined {
  const { left } = loop;
  const declared =
    left.type === AST_NODE_TYPES.VariableDeclaration ? left.declarations[0].id : undefined;
  return declared?.type === AST_NODE_TYPES.Identifier
    ? { kind: 'loop', body: loop.body, nodeName: declared.name }
    : undefined;
}

export function enclosingWalk(node: TSESTree.Node): Walk | undefined {
  const owner = ancestorsOf(node).find(
    (ancestor) =>
      (ancestor.type === AST_NODE_TYPES.ForOfStatement && contains(ancestor.body, node)) ||
      isFunctionNode(ancestor),
  );
  if (owner === undefined) {
    return undefined;
  }
  if (owner.type === AST_NODE_TYPES.ForOfStatement) {
    return loopWalk(owner);
  }
  return isFunctionNode(owner) ? functionWalk(owner) : undefined;
}
