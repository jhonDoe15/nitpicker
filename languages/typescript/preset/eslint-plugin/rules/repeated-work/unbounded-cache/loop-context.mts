import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import {
  ancestorsOf,
  constantInitializer,
  contains,
  depthFirst,
  nodeChildren,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { calledMethod, constantNumericValue } from '../materialize/unbounded-source.mts';
import { isReferencedIdentifier } from '../support/ast-walk.mts';

const SMALL_RANGE_LIMIT = 100;
const LOOP_CALLBACK_METHODS = new Set(['forEach', 'map']);
const OBJECT_ITERATION_METHODS = new Set(['keys', 'values', 'entries']);
const BOUND_OPERATORS = new Set(['<', '<=', '>', '>=', '!=', '!==']);

function isLoopStatement(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ForStatement ||
    node.type === AST_NODE_TYPES.ForOfStatement ||
    node.type === AST_NODE_TYPES.ForInStatement ||
    node.type === AST_NODE_TYPES.WhileStatement ||
    node.type === AST_NODE_TYPES.DoWhileStatement
  );
}

function isFunctionBoundary(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

export function isLoopCallback(node: TSESTree.Node): boolean {
  if (
    node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    node.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return false;
  }
  const parent = node.parent;
  if (parent?.type !== AST_NODE_TYPES.CallExpression || parent.arguments[0] !== node) {
    return false;
  }
  const callee = unwrapped(parent.callee);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    LOOP_CALLBACK_METHODS.has(memberName(callee) ?? '')
  );
}

export function enclosingLoop(node: TSESTree.Node): TSESTree.Node | undefined {
  for (const ancestor of ancestorsOf(node)) {
    if (isLoopStatement(ancestor) || isLoopCallback(ancestor)) {
      return ancestor;
    }
    if (isFunctionBoundary(ancestor)) {
      return undefined;
    }
  }
  return undefined;
}

function isSmallObject(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  seen: ReadonlySet<string>,
): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.ObjectExpression) {
    return (
      value.properties.length <= SMALL_RANGE_LIMIT &&
      value.properties.every(
        (prop) =>
          prop.type !== AST_NODE_TYPES.SpreadElement ||
          isSmallObject(sourceCode, prop.argument, seen),
      )
    );
  }
  if (value.type === AST_NODE_TYPES.Identifier && !seen.has(value.name)) {
    const init = constantInitializer(sourceCode, value);
    return init !== undefined && isSmallObject(sourceCode, init, new Set([...seen, value.name]));
  }
  return false;
}

function isSmallObjectCall(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  seen: ReadonlySet<string>,
): boolean {
  const target = calledMethod(call);
  if (target === undefined) {
    return false;
  }
  if (
    target.callee.object.type === AST_NODE_TYPES.Identifier &&
    target.callee.object.name === 'Object' &&
    OBJECT_ITERATION_METHODS.has(target.method)
  ) {
    const [first] = call.arguments;
    return first !== undefined && isSmallObject(sourceCode, first, seen);
  }
  if (target.method === 'slice' && call.arguments.length >= 2) {
    const end = constantNumericValue(sourceCode, call.arguments[1]);
    return end !== undefined && Math.abs(end) <= SMALL_RANGE_LIMIT;
  }
  return false;
}

function isSmallIterable(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return (
      value.elements.length <= SMALL_RANGE_LIMIT &&
      value.elements.every(
        (el) =>
          el === null ||
          el.type !== AST_NODE_TYPES.SpreadElement ||
          isSmallIterable(sourceCode, el.argument, seen),
      )
    );
  }
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return isSmallObjectCall(sourceCode, value, seen);
  }
  if (value.type === AST_NODE_TYPES.Identifier && !seen.has(value.name)) {
    const init = constantInitializer(sourceCode, value);
    return init !== undefined && isSmallIterable(sourceCode, init, new Set([...seen, value.name]));
  }
  return false;
}

function hasSmallNumericBound(sourceCode: SourceCode, loop: TSESTree.ForStatement): boolean {
  const test = loop.test;
  if (test?.type !== AST_NODE_TYPES.BinaryExpression || !BOUND_OPERATORS.has(test.operator)) {
    return false;
  }
  const right = constantNumericValue(sourceCode, test.right);
  const left = constantNumericValue(sourceCode, test.left);
  const bound = right ?? left;
  return bound !== undefined && Math.abs(bound) <= SMALL_RANGE_LIMIT;
}

export function isBoundedLoop(sourceCode: SourceCode, loop: TSESTree.Node): boolean {
  if (loop.type === AST_NODE_TYPES.ForOfStatement) {
    return isSmallIterable(sourceCode, loop.right);
  }
  if (loop.type === AST_NODE_TYPES.ForInStatement) {
    return isSmallObject(sourceCode, loop.right, new Set());
  }
  if (loop.type === AST_NODE_TYPES.ForStatement) {
    return hasSmallNumericBound(sourceCode, loop);
  }
  if (isLoopCallback(loop) && loop.parent?.type === AST_NODE_TYPES.CallExpression) {
    const callee = unwrapped(loop.parent.callee);
    return (
      callee.type === AST_NODE_TYPES.MemberExpression && isSmallIterable(sourceCode, callee.object)
    );
  }
  return false;
}

function collectIdentifiers(part: TSESTree.Node, names: Set<string>): void {
  for (const node of depthFirst(part, nodeChildren)) {
    if (node.type === AST_NODE_TYPES.Identifier && isReferencedIdentifier(node)) {
      names.add(node.name);
    }
  }
}

function headerParts(loop: TSESTree.Node): (TSESTree.Node | null | undefined)[] {
  if (loop.type === AST_NODE_TYPES.ForOfStatement || loop.type === AST_NODE_TYPES.ForInStatement) {
    return [loop.left];
  }
  if (loop.type === AST_NODE_TYPES.ForStatement) {
    return [loop.init, loop.update];
  }
  if (
    loop.type === AST_NODE_TYPES.WhileStatement ||
    loop.type === AST_NODE_TYPES.DoWhileStatement
  ) {
    return [loop.test];
  }
  return [];
}

function headerBoundNames(loop: TSESTree.Node): Set<string> {
  const names = new Set<string>();
  for (const part of headerParts(loop)) {
    if (part !== null && part !== undefined) {
      collectIdentifiers(part, names);
    }
  }
  return names;
}

function isDefinedInLoop(
  sourceCode: SourceCode,
  loop: TSESTree.Node,
  identifier: TSESTree.Identifier,
): boolean {
  const variable = variableNamed(sourceCode, identifier);
  if (variable === undefined) {
    return false;
  }
  return variable.defs.some((def) => contains(loop, def.node));
}

function expressionDependsOnLoop(
  sourceCode: SourceCode,
  loop: TSESTree.Node,
  root: TSESTree.Node,
): boolean {
  const headerNames = headerBoundNames(loop);
  for (const node of depthFirst(root, nodeChildren)) {
    if (
      node.type === AST_NODE_TYPES.Identifier &&
      isReferencedIdentifier(node) &&
      (headerNames.has(node.name) || isDefinedInLoop(sourceCode, loop, node))
    ) {
      return true;
    }
  }
  return false;
}

export function dependsOnLoopElement(
  sourceCode: SourceCode,
  loop: TSESTree.Node,
  nodes: readonly TSESTree.Node[],
): boolean {
  return nodes.some((root) => expressionDependsOnLoop(sourceCode, loop, root));
}
