import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import { forEachNode } from '../../analysis/node/wrapper-calls.mts';
import { isReadIdentifier, patternNames } from '../../repeated-work/support/ast-walk.mts';

const LOOP_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);
const GUARD_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.FunctionDeclaration,
]);
const CHEAP_GLOBAL_CALLS = new Set([
  'Boolean',
  'String',
  'Number',
  'BigInt',
  'Symbol',
  'Set',
  'Map',
  'WeakSet',
  'WeakMap',
  'URL',
  'RegExp',
  'Error',
  'TypeError',
  'RangeError',
]);
const CHEAP_MEMBER_OBJECTS = new Set([
  'path',
  'Object',
  'Math',
  'console',
  'Date',
  'performance',
  'AbortSignal',
  'Number',
  'String',
  'Reflect',
]);
const CHEAP_ARRAY_METHODS = new Set(['isArray', 'from', 'of']);
const MUTATING_METHODS = new Set(['push', 'unshift', 'splice', 'add', 'set', 'delete', 'clear']);

function isCheapCall(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return CHEAP_GLOBAL_CALLS.has(callee.name);
  }
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.object.type !== AST_NODE_TYPES.Identifier ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  return (
    CHEAP_MEMBER_OBJECTS.has(callee.object.name) ||
    (callee.object.name === 'Array' && CHEAP_ARRAY_METHODS.has(callee.property.name))
  );
}

export function isNonTrivialLocalWork(
  context: SourceContext,
  statement: TSESTree.Statement,
): boolean {
  if (GUARD_TYPES.has(statement.type)) {
    return false;
  }
  if (LOOP_TYPES.has(statement.type)) {
    return true;
  }
  let found = false;
  forEachNode(context, statement, (node) => {
    if (!found && node.type === AST_NODE_TYPES.CallExpression && !isCheapCall(node)) {
      found = true;
    }
  });
  return found;
}

function collectPatternNames(root: TSESTree.Node, names: Set<string>): void {
  for (const name of patternNames(root)) {
    names.add(name);
  }
}

function recordLoopMutation(node: TSESTree.Node, mutated: Set<string>, locals: Set<string>): void {
  if (node.type === AST_NODE_TYPES.VariableDeclarator) {
    collectPatternNames(node.id, locals);
    return;
  }
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    const target =
      node.left.type === AST_NODE_TYPES.MemberExpression ? node.left.object : node.left;
    if (target.type === AST_NODE_TYPES.Identifier) {
      mutated.add(target.name);
    }
    return;
  }
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    MUTATING_METHODS.has(node.callee.property.name)
  ) {
    mutated.add(node.callee.object.name);
  }
}

function loopMutatedBindings(context: SourceContext, statement: TSESTree.Statement): Set<string> {
  const mutated = new Set<string>();
  const locals = new Set<string>();
  forEachNode(context, statement, (node) => recordLoopMutation(node, mutated, locals));
  for (const local of locals) {
    mutated.delete(local);
  }
  return mutated;
}

export function producedBindings(
  context: SourceContext,
  statement: TSESTree.Statement,
): Set<string> {
  const names = new Set<string>();
  if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
    for (const declarator of statement.declarations) {
      collectPatternNames(declarator.id, names);
    }
    return names;
  }
  if (
    statement.type === AST_NODE_TYPES.ExpressionStatement &&
    statement.expression.type === AST_NODE_TYPES.AssignmentExpression
  ) {
    collectPatternNames(statement.expression.left, names);
    return names;
  }
  return LOOP_TYPES.has(statement.type) ? loopMutatedBindings(context, statement) : names;
}

export function readIdentifiers(context: SourceContext, node: TSESTree.Node): Set<string> {
  const names = new Set<string>();
  forEachNode(context, node, (candidate) => {
    if (candidate.type === AST_NODE_TYPES.Identifier && isReadIdentifier(candidate)) {
      names.add(candidate.name);
    }
  });
  return names;
}
