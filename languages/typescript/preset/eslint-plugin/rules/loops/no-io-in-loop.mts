import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { batchSuggestion } from '../../fixes/queries/batch/suggestion.mts';
import { suggestible } from '../../fixes/support/descriptors.mts';
import type { Context } from '../security/security-values.mts';
import { calleeOrigin, describePath, ioEffect, ioKind } from '../support/io-effects.mts';
import { isRelayMark } from '../writes/relays.mts';
import { outerCalls } from './builders/chain-execution.mts';
import { isEntityFactory } from './builders/entity-factories.mts';
import { isUnexecutedBuilder } from './builders/unexecuted-calls.mts';
import { passesChunk } from './chunked-loops.mts';
import { isPushedForConcurrency } from './concurrent-batches.mts';
import { enclosingLoop, isRetryAttempt, type EnclosingLoop } from './loop-shapes.mts';
import { isPagingCall } from './paging-calls.mts';
import { isDrainCall } from './repeats/drain-loops.mts';
import { isPollingCall, isRereadInCatch } from './repeats/polling-loops.mts';
import { batchForm } from './advice/batch-forms.mts';
import { IO_IN_LOOP_MESSAGES } from './advice/messages.mts';
import { IO_IN_LOOP_SUGGESTIONS } from './advice/suggestion-messages.mts';
import { adviceOf, type Advice } from './advice/query-advice.mts';

type ReportIds = keyof typeof IO_IN_LOOP_MESSAGES;
type MessageIds = ReportIds | keyof typeof IO_IN_LOOP_SUGGESTIONS;
type Docs = { readonly requiresTypeChecking: boolean };
type Call = TSESTree.CallExpression | TSESTree.TaggedTemplateExpression;
type Effect = NonNullable<ReturnType<typeof ioEffect>>;

function messageIdOf(effect: Effect, concurrent: boolean, advice: Advice): ReportIds {
  if (advice === 'dependentQuery') {
    return advice;
  }
  if (effect.kind === 'remote') {
    return 'request';
  }
  if (effect.cache) {
    return 'cacheQuery';
  }
  if (advice !== 'query') {
    return advice;
  }
  return concurrent ? 'concurrentQuery' : 'query';
}

function isLoopCall(node: Call, found: EnclosingLoop, context: Context): boolean {
  const { visitorKeys } = context.sourceCode;
  return !(
    isRetryAttempt(node, found.loop, visitorKeys) ||
    isPagingCall(node, found.loop, visitorKeys) ||
    isDrainCall(node, found.loop, context) ||
    isPollingCall(node, found.loop, context) ||
    isRereadInCatch(node, found.loop, context)
  );
}

export const rule: TSESLint.RuleModule<MessageIds, [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not run a database query or a remote request once per loop item',
      requiresTypeChecking: true,
    },
    hasSuggestions: true,
    schema: [],
    messages: { ...IO_IN_LOOP_MESSAGES, ...IO_IN_LOOP_SUGGESTIONS },
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
      const advice = adviceOf(node, found, context);
      const descriptor = {
        node,
        messageId: messageIdOf(effect, concurrent, advice),
        data: {
          callee: describePath(effect.path),
          form: batchForm(effect.path[0] ?? '', calleeOrigin(node, context)?.pkg),
        },
      };
      const batchable =
        node.type === AST_NODE_TYPES.CallExpression &&
        (advice === 'query' || advice === 'foreignKeyQuery');
      const suggestion = batchable ? batchSuggestion(context, node) : undefined;
      context.report(suggestion === undefined ? descriptor : suggestible(descriptor, suggestion));
    }
    return { CallExpression: check, TaggedTemplateExpression: check };
  },
};
