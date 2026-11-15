import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../security/security-values.mts';
import { hasCollectionType } from '../support/checked-types.mts';
import { ancestorsOf, contains, isNode, nameOf, type SourceCode } from '../typed/node-views.mts';
import { isConcurrentBatch } from './concurrent-batches.mts';

export type LoopNode =
  | TSESTree.ForOfStatement
  | TSESTree.ForInStatement
  | TSESTree.ForStatement
  | TSESTree.WhileStatement
  | TSESTree.DoWhileStatement;
export type TestedLoop =
  TSESTree.ForStatement | TSESTree.WhileStatement | TSESTree.DoWhileStatement;
type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
export type IdentifierAssignment = TSESTree.AssignmentExpression & {
  readonly left: TSESTree.Identifier;
};
export type VisitorKeys = SourceCode['visitorKeys'];
export type EnclosingLoop =
  | {
      readonly loop: LoopNode;
      readonly child: TSESTree.Node;
      readonly callback?: undefined;
      readonly concurrent?: undefined;
    }
  | {
      readonly callback: FunctionNode;
      readonly concurrent: boolean;
      readonly loop?: undefined;
      readonly child?: undefined;
    };

const ITERATION_METHODS = new Set([
  'map',
  'forEach',
  'flatMap',
  'filter',
  'reduce',
  'some',
  'every',
  'find',
  'findIndex',
  'reduceRight',
  'findLast',
  'findLastIndex',
  'sort',
  'toSorted',
]);
const LOOP_EXITS = new Set<string>([
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.BreakStatement,
]);

function isLoop(node: TSESTree.Node): node is LoopNode {
  return (
    node.type === AST_NODE_TYPES.ForOfStatement ||
    node.type === AST_NODE_TYPES.ForInStatement ||
    node.type === AST_NODE_TYPES.ForStatement ||
    node.type === AST_NODE_TYPES.WhileStatement ||
    node.type === AST_NODE_TYPES.DoWhileStatement
  );
}

export function isFunction(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function isBreakTarget(node: TSESTree.Node): boolean {
  return isLoop(node) || node.type === AST_NODE_TYPES.SwitchStatement;
}

export function isIdentifierAssignment(node: TSESTree.Node): node is IdentifierAssignment {
  return (
    node.type === AST_NODE_TYPES.AssignmentExpression &&
    node.left.type === AST_NODE_TYPES.Identifier
  );
}

export function childrenOf(node: TSESTree.Node, visitorKeys: VisitorKeys): TSESTree.Node[] {
  return (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value: unknown = Reflect.get(node, key);
    const items: readonly unknown[] = Array.isArray(value) ? value : [value];
    return items.filter(isNode);
  });
}

export function descendants(
  root: TSESTree.Node,
  visitorKeys: VisitorKeys,
  isBoundary: (node: TSESTree.Node) => boolean,
): TSESTree.Node[] {
  const found: TSESTree.Node[] = [];
  const pending = [root];
  for (const node of pending) {
    found.push(node);
    if (node === root || !isBoundary(node)) {
      pending.push(...childrenOf(node, visitorKeys));
    }
  }
  return found;
}

function isLoopBody(loop: LoopNode, child: TSESTree.Node): boolean {
  return (
    child === loop.body ||
    ('test' in loop && child === loop.test) ||
    ('update' in loop && child === loop.update)
  );
}

function isIterationCallback(fn: FunctionNode, context: Context): boolean {
  const call = fn.parent;
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    !call.arguments.some((argument) => argument === fn) ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return false;
  }
  const { object, property } = call.callee;
  const method = nameOf(property);
  const mapsFrom = method === 'from' && nameOf(object) === 'Array' && call.arguments[1] === fn;
  const iterates =
    method !== undefined &&
    ITERATION_METHODS.has(method) &&
    hasCollectionType(context, object) !== 'no';
  return mapsFrom || iterates;
}

export function isIterationCall(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  const method =
    callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
      ? nameOf(callee.property)
      : undefined;
  return method !== undefined && ITERATION_METHODS.has(method);
}

export function enclosingLoop(node: TSESTree.Node, context: Context): EnclosingLoop | undefined {
  let child = node;
  for (const parent of ancestorsOf(node)) {
    if (isLoop(parent) && isLoopBody(parent, child)) {
      return { loop: parent, child };
    }
    if (isFunction(parent)) {
      return isIterationCallback(parent, context)
        ? { callback: parent, concurrent: isConcurrentBatch(parent, context.sourceCode) }
        : undefined;
    }
    child = parent;
  }
  return undefined;
}

function breaksOut(node: TSESTree.BreakStatement, block: TSESTree.Node): boolean {
  const inner = ancestorsOf(node).filter((ancestor) => contains(block, ancestor));
  return node.label === null && !inner.some(isBreakTarget);
}

function exitsLoop(block: TSESTree.Node, visitorKeys: VisitorKeys): boolean {
  const nodes = descendants(block, visitorKeys, isFunction);
  return nodes.some(
    (node) =>
      node.type === AST_NODE_TYPES.ReturnStatement ||
      (node.type === AST_NODE_TYPES.BreakStatement && breaksOut(node, block)),
  );
}

function retryingTry(loop: LoopNode, call: TSESTree.Node): TSESTree.TryStatement | undefined {
  const statements =
    loop.body.type === AST_NODE_TYPES.BlockStatement ? loop.body.body : [loop.body];
  return statements.find(
    (statement): statement is TSESTree.TryStatement =>
      statement.type === AST_NODE_TYPES.TryStatement && contains(statement.block, call),
  );
}

export function isRetryAttempt(
  call: TSESTree.Node,
  loop: LoopNode | undefined,
  visitorKeys: VisitorKeys,
): boolean {
  const attempt = loop === undefined ? undefined : retryingTry(loop, call);
  const handler = attempt?.handler;
  if (attempt === undefined || handler === undefined || handler === null) {
    return false;
  }
  const continues = !handler.body.body.some((statement) => LOOP_EXITS.has(statement.type));
  return continues && exitsLoop(attempt.block, visitorKeys);
}
