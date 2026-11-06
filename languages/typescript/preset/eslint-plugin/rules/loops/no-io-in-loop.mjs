import { chainOuterCall, describePath, ioEffect, ioKind } from '../support/io-effects.mjs';
import { isRelayMark } from '../writes/relays.mjs';
import { passesChunk } from './chunked-loops.mjs';
import { isPushedForConcurrency } from './concurrent-batches.mjs';
import { enclosingLoop, isPagingCall, isRetryAttempt } from './loop-shapes.mjs';

const BATCH_QUERY = [
  'Fetch or write them in one query: a batch method (`findByIds`, `findAllById`, `createMany`,',
  '`insertMany`) or `WHERE id IN (...)`, run before the loop.',
].join(' ');
const EXCEPTION = 'An exception fits only when a call per item is intended';

const PAGING =
  'Paging, cursor and retry loops are fine, and so is a call that takes a whole chunk of the items.';

function messageIdOf(effect, concurrent) {
  if (effect.kind === 'remote') {
    return 'request';
  }
  if (effect.cache) {
    return 'cacheQuery';
  }
  return concurrent ? 'concurrentQuery' : 'query';
}

function isLoopCall(node, found, context) {
  const { visitorKeys } = context.sourceCode;
  return (
    found !== undefined &&
    !isRetryAttempt(node, found.loop, visitorKeys) &&
    !isPagingCall(node, found.loop, visitorKeys)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not run a database query or a remote request once per loop item',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      query: [
        'This runs {{callee}} once per item of a loop, one query per item.',
        BATCH_QUERY,
        PAGING,
        `${EXCEPTION} (a store with no batch form).`,
      ].join(' '),
      cacheQuery: [
        'This runs {{callee}} once per item of a loop, one round trip per item.',
        'Fetch or write them in one round trip: `mget`/`mset`/`hmget`, or queue the commands on',
        '`pipeline()` (or `multi()`) and `exec()` it once after the loop.',
        PAGING,
        `${EXCEPTION} (a command with no multi-key form).`,
      ].join(' '),
      concurrentQuery: [
        'This runs {{callee}} once per item inside a concurrent `Promise.all`:',
        'running them concurrently still sends one query per item.',
        BATCH_QUERY,
        `${EXCEPTION} (a store with no batch form).`,
      ].join(' '),
      request: [
        'This calls {{callee}} once per item of a loop, one request after another.',
        "Use the API's batch endpoint when it has one; otherwise run the requests with bounded concurrency:",
        '`p-limit`, `p-map` with `{ concurrency }`, or `Promise.all` over fixed-size chunks.',
        PAGING,
        `${EXCEPTION} (an API with no batch form and a rate limit).`,
      ].join(' '),
    },
  },
  create(context) {
    function check(node) {
      const { sourceCode } = context;
      const found = enclosingLoop(node, sourceCode);
      const effect = isLoopCall(node, found, context) ? ioEffect(node, context) : undefined;
      const exempt =
        effect === undefined ||
        effect.kind === 'message' ||
        passesChunk(node, found, context) ||
        isRelayMark(node, context);
      if (exempt) {
        return;
      }
      const concurrent = found.concurrent === true || isPushedForConcurrency(node, sourceCode);
      const outer = chainOuterCall(node);
      const reportedByOuter = outer !== undefined && ioKind(outer, context) === effect.kind;
      if ((concurrent && effect.kind === 'remote') || reportedByOuter) {
        return;
      }
      context.report({
        node,
        messageId: messageIdOf(effect, concurrent),
        data: { callee: describePath(effect.path) },
      });
    }
    return { CallExpression: check, TaggedTemplateExpression: check };
  },
};
