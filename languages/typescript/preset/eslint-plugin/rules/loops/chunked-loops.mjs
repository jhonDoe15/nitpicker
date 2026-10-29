import { hasArrayType } from '../support/checked-types.mjs';
import { wordsOf } from '../support/identifier-words.mjs';
import { childrenOf, contains } from './loop-shapes.mjs';

const CHUNK_WORDS = new Set(['chunk', 'chunks', 'chunked', 'batch', 'batches', 'batched']);
const SLICES = new Set(['slice', 'splice', 'subarray']);
const IDENTIFIER = 'Identifier';
const CALL = 'CallExpression';

function calleeName(callee) {
  if (callee.type === IDENTIFIER) {
    return callee.name;
  }
  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : '';
}

function isChunkSource(node) {
  const target = node.type === 'AwaitExpression' ? node.argument : node;
  if (target.type === CALL) {
    return wordsOf(calleeName(target.callee)).some((word) => CHUNK_WORDS.has(word));
  }
  const name = target.type === IDENTIFIER ? target.name : calleeName(target);
  return CHUNK_WORDS.has(wordsOf(name).at(-1));
}

function declaredIn(sourceCode, node) {
  return sourceCode.getDeclaredVariables(node);
}

function isTypedChunk(context, node) {
  return node?.type === IDENTIFIER && hasArrayType(context, node, false) === true;
}

function forOfChunks(context, loop) {
  const { left, right } = loop;
  if (left.type !== 'VariableDeclaration') {
    return [];
  }
  const [declarator] = left.declarations;
  const isChunk = isChunkSource(right) || isTypedChunk(context, declarator.id);
  return isChunk ? declaredIn(context.sourceCode, left) : [];
}

function callbackChunks(context, callback) {
  const [param] = callback.params;
  const callee = callback.parent.callee;
  const iterable = callee.type === 'MemberExpression' ? callee.object : undefined;
  const isChunk =
    param !== undefined &&
    ((iterable !== undefined && isChunkSource(iterable)) || isTypedChunk(context, param));
  return isChunk
    ? declaredIn(context.sourceCode, callback).filter((variable) =>
        variable.defs.some((def) => contains(param, def.name)),
      )
    : [];
}

function isSlice(init) {
  return init?.type === CALL && SLICES.has(calleeName(init.callee));
}

function slicedChunks(context, loop) {
  const statements = loop.body?.type === 'BlockStatement' ? loop.body.body : [];
  return statements
    .filter((statement) => statement.type === 'VariableDeclaration')
    .flatMap((statement) => statement.declarations.filter((declarator) => isSlice(declarator.init)))
    .flatMap((declarator) => declaredIn(context.sourceCode, declarator));
}

function chunkVariables(context, found) {
  if (found.callback !== undefined) {
    return callbackChunks(context, found.callback);
  }
  const iterated = found.loop.type === 'ForOfStatement' ? forOfChunks(context, found.loop) : [];
  return [...iterated, ...slicedChunks(context, found.loop)];
}

function slicesInline(args, visitorKeys) {
  const pending = [...args];
  for (const node of pending) {
    if (isSlice(node) || (node.type === CALL && isChunkSource(node))) {
      return true;
    }
    pending.push(...childrenOf(node, visitorKeys));
  }
  return false;
}

export function passesChunk(call, found, context) {
  const args = call.type === CALL ? call.arguments : [call.quasi];
  if (slicesInline(args, context.sourceCode.visitorKeys)) {
    return true;
  }
  return chunkVariables(context, found).some((variable) =>
    variable.references.some((reference) =>
      args.some((argument) => contains(argument, reference.identifier)),
    ),
  );
}
