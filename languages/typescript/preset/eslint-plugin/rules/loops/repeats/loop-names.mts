import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  descendants,
  type EnclosingLoop,
  type LoopNode,
  type VisitorKeys,
} from '../loop-shapes.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';
import { nameOf } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';

type Declared = TSESTree.Node | undefined;

const CONSUMING_METHODS = new Set(['shift', 'pop', 'next', 'dequeue']);

function subpatterns(pattern: TSESTree.Node): TSESTree.Node[] {
  if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
    return pattern.properties.map((property) =>
      property.type === AST_NODE_TYPES.Property ? property.value : property.argument,
    );
  }
  if (pattern.type === AST_NODE_TYPES.ArrayPattern) {
    return pattern.elements.filter((element) => element !== null);
  }
  if (pattern.type === AST_NODE_TYPES.AssignmentPattern) {
    return [pattern.left];
  }
  return pattern.type === AST_NODE_TYPES.RestElement ? [pattern.argument] : [];
}

function patternNames(pattern: Declared): string[] {
  const names: string[] = [];
  const pending: TSESTree.Node[] = pattern === undefined ? [] : [pattern];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.Identifier) {
      names.push(current.name);
      continue;
    }
    appendAll(pending, subpatterns(current));
  }
  return names;
}

function declarationNames(node: Declared): string[] {
  return node?.type === AST_NODE_TYPES.VariableDeclaration
    ? node.declarations.flatMap((declarator) => patternNames(declarator.id))
    : [];
}

export function bodyDeclaredNames(loop: LoopNode, visitorKeys: VisitorKeys): Set<string> {
  return new Set(
    descendants(loop.body, visitorKeys, isFunction)
      .filter((node) => node.type === AST_NODE_TYPES.VariableDeclarator)
      .flatMap((declarator) => patternNames(declarator.id)),
  );
}

export function isConsumingCall(node: TSESTree.Node): boolean {
  const value = node.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node;
  return (
    value.type === AST_NODE_TYPES.CallExpression &&
    value.callee.type === AST_NODE_TYPES.MemberExpression &&
    CONSUMING_METHODS.has(nameOf(value.callee.property) ?? '')
  );
}

function isOwnStep(node: TSESTree.AssignmentExpression, visitorKeys: VisitorKeys): boolean {
  const own = patternNames(node.left);
  const steps =
    node.right.type === AST_NODE_TYPES.BinaryExpression ||
    node.right.type === AST_NODE_TYPES.MemberExpression;
  return steps && own.some((name) => referencedNames(node.right, visitorKeys).has(name));
}

function isSelfStep(node: TSESTree.Node, visitorKeys: VisitorKeys): boolean {
  if (node.type === AST_NODE_TYPES.UpdateExpression) {
    return true;
  }
  if (node.type !== AST_NODE_TYPES.AssignmentExpression) {
    return false;
  }
  return node.operator !== '=' || isConsumingCall(node.right) || isOwnStep(node, visitorKeys);
}

function testAssignedNames(loop: LoopNode, visitorKeys: VisitorKeys): string[] {
  const test = 'test' in loop ? loop.test : undefined;
  return test === null || test === undefined
    ? []
    : descendants(test, visitorKeys, isFunction)
        .filter((node) => node.type === AST_NODE_TYPES.AssignmentExpression)
        .flatMap((node) => patternNames(node.left));
}

function updatedNames(loop: LoopNode, visitorKeys: VisitorKeys): string[] {
  const update = 'update' in loop ? loop.update : undefined;
  const roots = update === null || update === undefined ? [loop.body] : [loop.body, update];
  return roots
    .flatMap((root) => descendants(root, visitorKeys, isFunction))
    .filter((node) => isSelfStep(node, visitorKeys))
    .flatMap((node) => {
      if (node.type === AST_NODE_TYPES.UpdateExpression) {
        return patternNames(node.argument);
      }
      return node.type === AST_NODE_TYPES.AssignmentExpression ? patternNames(node.left) : [];
    });
}

export function itemNames(found: EnclosingLoop, visitorKeys: VisitorKeys): Set<string> {
  if (found.callback !== undefined) {
    return new Set(found.callback.params.flatMap(patternNames));
  }
  const { loop } = found;
  if (loop.type === AST_NODE_TYPES.ForOfStatement || loop.type === AST_NODE_TYPES.ForInStatement) {
    return new Set(declarationNames(loop.left));
  }
  const init = loop.type === AST_NODE_TYPES.ForStatement ? loop.init : undefined;
  return new Set([
    ...declarationNames(init ?? undefined),
    ...updatedNames(loop, visitorKeys),
    ...testAssignedNames(loop, visitorKeys),
  ]);
}

export function referencedNames(node: TSESTree.Node, visitorKeys: VisitorKeys): Set<string> {
  return new Set(
    descendants(node, visitorKeys, isFunction)
      .filter((each) => each.type === AST_NODE_TYPES.Identifier)
      .map(({ name }) => name),
  );
}
