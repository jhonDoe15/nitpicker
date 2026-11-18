import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../security/security-values.mts';
import { describePath, ioEffect, ioKind } from '../support/io-effects.mts';
import { isRelayMark } from '../writes/relays.mts';
import { outerCalls } from './builders/chain-execution.mts';
import { isEntityFactory } from './builders/entity-factories.mts';
import { isUnexecutedBuilder } from './builders/unexecuted-calls.mts';
import { passesChunk } from './chunked-loops.mts';
import { isPushedForConcurrency } from './concurrent-batches.mts';
import { enclosingLoop, isRetryAttempt, type EnclosingLoop } from './loop-shapes.mts';
import { isPagingCall } from './paging-calls.mts';

type MessageIds = 'query' | 'cacheQuery' | 'concurrentQuery' | 'request';
type Docs = { readonly requiresTypeChecking: boolean };
type Call = TSESTree.CallExpression | TSESTree.TaggedTemplateExpression;
type Effect = NonNullable<ReturnType<typeof ioEffect>>;

const BATCH_QUERY = [
  'Fetch or write them in one query: a batch method (`findByIds`, `findAllById`, `createMany`,',
  '`insertMany`) or `WHERE id IN (...)`, run before the loop.',
].join(' ');
const EXCEPTION = 'An exception fits only when a call per item is intended';

const PAGING =
  'Paging, cursor and retry loops are fine, and so is a call that takes a whole chunk of the items.';

function messageIdOf(effect: Effect, concurrent: boolean): MessageIds {
  if (effect.kind === 'remote') {
    return 'request';
  }
  if (effect.cache) {
    return 'cacheQuery';
  }
  return concurrent ? 'concurrentQuery' : 'query';
}

function isLoopCall(node: Call, found: EnclosingLoop, context: Context): boolean {
  const { visitorKeys } = context.sourceCode;
  return !(
    isRetryAttempt(node, found.loop, visitorKeys) || isPagingCall(node, found.loop, visitorKeys)
  );
}

export const rule: TSESLint.RuleModule<MessageIds, [], Docs> = {
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
    function check(node: Call): void {
      const { sourceCode } = context;
      const found = enclosingLoop(node, context);
      const effect =
        found !== undefined && isLoopCall(node, found, context)
          ? ioEffect(node, context)
          : undefined;
      const exempt =
        found === undefined ||
        effect === undefined ||
        effect.kind === 'message' ||
        passesChunk(node, found, context) ||
        isRelayMark(node, context) ||
        isEntityFactory(node, context) ||
        isUnexecutedBuilder(node, context);
      if (exempt) {
        return;
      }
      const concurrent = found.concurrent === true || isPushedForConcurrency(node, sourceCode);
      const reportedByOuter = outerCalls(node).some(
        (outer) => ioKind(outer, context) === effect.kind,
      );
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
