import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../security/security-values.mts';
import { hasArrayType } from '../support/checked-types.mts';
import { wordsOf as untypedWordsOf } from '../../../../../../shared/naming/secret-words.mjs';
import { contains } from '../typed/node-views.mts';
import { calleeName } from '../typed/syntax-views.mts';
import { childrenOf, type EnclosingLoop, type LoopNode } from './loop-shapes.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const wordsOf: (name: string) => string[] = untypedWordsOf;

const CHUNK_WORDS = new Set(['chunk', 'chunks', 'chunked', 'batch', 'batches', 'batched']);
const SLICES = new Set(['slice', 'splice', 'subarray']);

function isChunkSource(node: TSESTree.Node): boolean {
  const target = node.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node;
  if (target.type === AST_NODE_TYPES.CallExpression) {
    return wordsOf(calleeName(target.callee)).some((word) => CHUNK_WORDS.has(word));
  }
  const name = target.type === AST_NODE_TYPES.Identifier ? target.name : calleeName(target);
  const last = wordsOf(name).at(-1);
  return last !== undefined && CHUNK_WORDS.has(last);
}

function declaredIn(context: Context, node: TSESTree.Node): readonly TSESLint.Scope.Variable[] {
  return context.sourceCode.getDeclaredVariables(node);
}

function isTypedChunk(context: Context, node: TSESTree.Node | undefined): boolean {
  return node?.type === AST_NODE_TYPES.Identifier && hasArrayType(context, node, false) === 'yes';
}

function forOfChunks(
  context: Context,
  loop: TSESTree.ForOfStatement,
): readonly TSESLint.Scope.Variable[] {
  const { left, right } = loop;
  if (left.type !== AST_NODE_TYPES.VariableDeclaration) {
    return [];
  }
  const [declarator] = left.declarations;
  const isChunk = isChunkSource(right) || isTypedChunk(context, declarator.id);
  return isChunk ? declaredIn(context, left) : [];
}

function callbackChunks(
  context: Context,
  callback: FunctionNode,
): readonly TSESLint.Scope.Variable[] {
  const [param] = callback.params;
  const call = callback.parent;
  const callee = call.type === AST_NODE_TYPES.CallExpression ? call.callee : undefined;
  const iterable = callee?.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
  const isChunk =
    param !== undefined &&
    ((iterable !== undefined && isChunkSource(iterable)) || isTypedChunk(context, param));
  return isChunk
    ? declaredIn(context, callback).filter((variable) =>
        variable.defs.some((def) => contains(param, def.name)),
      )
    : [];
}

function isSlice(init: TSESTree.Node | undefined): boolean {
  return init?.type === AST_NODE_TYPES.CallExpression && SLICES.has(calleeName(init.callee));
}

function slicedChunks(context: Context, loop: LoopNode): readonly TSESLint.Scope.Variable[] {
  const statements = loop.body.type === AST_NODE_TYPES.BlockStatement ? loop.body.body : [];
  return statements
    .filter((statement) => statement.type === AST_NODE_TYPES.VariableDeclaration)
    .flatMap((statement) =>
      statement.declarations.filter((declarator) => isSlice(declarator.init ?? undefined)),
    )
    .flatMap((declarator) => declaredIn(context, declarator));
}

function chunkVariables(
  context: Context,
  found: EnclosingLoop,
): readonly TSESLint.Scope.Variable[] {
  if (found.callback !== undefined) {
    return callbackChunks(context, found.callback);
  }
  const iterated =
    found.loop.type === AST_NODE_TYPES.ForOfStatement ? forOfChunks(context, found.loop) : [];
  return [...iterated, ...slicedChunks(context, found.loop)];
}

function slicesInline(
  args: readonly TSESTree.Node[],
  visitorKeys: Context['sourceCode']['visitorKeys'],
): boolean {
  const pending = [...args];
  for (const node of pending) {
    if (isSlice(node) || (node.type === AST_NODE_TYPES.CallExpression && isChunkSource(node))) {
      return true;
    }
    appendAll(pending, childrenOf(node, visitorKeys));
  }
  return false;
}

export function passesChunk(
  call: TSESTree.CallExpression | TSESTree.TaggedTemplateExpression,
  found: EnclosingLoop,
  context: Context,
): boolean {
  const args = call.type === AST_NODE_TYPES.CallExpression ? call.arguments : [call.quasi];
  if (slicesInline(args, context.sourceCode.visitorKeys)) {
    return true;
  }
  return chunkVariables(context, found).some((variable) =>
    variable.references.some((reference) =>
      args.some((argument) => contains(argument, reference.identifier)),
    ),
  );
}
