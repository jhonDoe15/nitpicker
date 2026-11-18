import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  descendants,
  type EnclosingLoop,
  type LoopNode,
  type VisitorKeys,
} from '../loop-shapes.mts';
import { isFunction } from '../../typed/syntax-views.mts';

type Declared = TSESTree.Node | null | undefined;

function patternNames(pattern: Declared): string[] {
  if (pattern === null || pattern === undefined) {
    return [];
  }
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      return [pattern.name];
    case AST_NODE_TYPES.ObjectPattern:
      return pattern.properties.flatMap((property) =>
        patternNames(
          property.type === AST_NODE_TYPES.Property ? property.value : property.argument,
        ),
      );
    case AST_NODE_TYPES.ArrayPattern:
      return pattern.elements.flatMap(patternNames);
    case AST_NODE_TYPES.AssignmentPattern:
      return patternNames(pattern.left);
    case AST_NODE_TYPES.RestElement:
      return patternNames(pattern.argument);
    default:
      return [];
  }
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

function isSelfStep(node: TSESTree.Node, visitorKeys: VisitorKeys): boolean {
  if (node.type === AST_NODE_TYPES.UpdateExpression) {
    return true;
  }
  if (node.type !== AST_NODE_TYPES.AssignmentExpression) {
    return false;
  }
  const own = patternNames(node.left);
  return (
    node.operator !== '=' ||
    (node.right.type === AST_NODE_TYPES.BinaryExpression &&
      own.some((name) => referencedNames(node.right, visitorKeys).has(name)))
  );
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
  return new Set([...declarationNames(init), ...updatedNames(loop, visitorKeys)]);
}

export function referencedNames(node: TSESTree.Node, visitorKeys: VisitorKeys): Set<string> {
  return new Set(
    descendants(node, visitorKeys, isFunction)
      .filter((each) => each.type === AST_NODE_TYPES.Identifier)
      .map(({ name }) => name),
  );
}
