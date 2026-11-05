import { resolveConstant } from '../analysis/constant-resolution.mjs';
import { clientBindings, isClientCall } from '../security/http/http-clients.mjs';
import { unwrapped } from '../security/security-values.mjs';
import {
  cleansUp,
  closesOverSignal,
  passesLifetimeOwner,
  signalParameterOf,
} from './operation-lifetime.mjs';
import { combinedEntries, operationsIn } from './race-operations.mjs';
import { globalMemberCall, isGlobalTimerCall } from './syntax-nodes.mjs';
import { isTimer, timeoutBindings, timeoutOf } from './timeout-entries.mjs';

const MAX_TEXT = 40;

const ADVICE =
  'Create an `AbortController`, abort it from the timeout path and pass `{ signal: controller.signal }` to the operation, or pass `AbortSignal.timeout(ms)` straight to an API that accepts `signal` and drop the race.';

function calleeText(context, call) {
  const text = context.sourceCode.getText(call.callee).replaceAll(/\s+/gu, ' ');
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}...` : text;
}

function isAbandoned(scope, call, race) {
  const { context } = scope;
  const callee = unwrapped(call.callee);
  const named = callee.type === 'Identifier' || callee.type === 'MemberExpression';
  return (
    named &&
    !isTimer(scope, call) &&
    !isGlobalTimerCall(context, call) &&
    !isClientCall(scope, call) &&
    !passesLifetimeOwner(context, call) &&
    !closesOverSignal(context, callee) &&
    !cleansUp(context, call, race)
  );
}

function raceTimeout(scope, node) {
  const { context } = scope;
  const list = unwrapped(resolveConstant(context, unwrapped(node.arguments[0])));
  if (list?.type !== 'ArrayExpression' || !globalMemberCall(context, node, 'Promise.race')) {
    return undefined;
  }
  const entries = combinedEntries(context, node);
  const timeouts = entries.map((entry) => timeoutOf(scope, entry));
  const timeout = timeouts.find((found) => found !== undefined);
  return timeout === undefined
    ? undefined
    : {
        node,
        timeout,
        timeouts: entries.filter((_, index) => timeouts[index] !== undefined),
        losers: entries.filter(
          (entry, index) => timeouts[index] === undefined && !isTimer(scope, entry),
        ),
      };
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require the operation raced against a timeout to receive its cancellation',
    },
    schema: [
      {
        type: 'object',
        properties: { fetch: { type: 'boolean' }, nodeFetchTimeout: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      noSignal: `\`Promise.race\` with {{timeout}} does not stop \`{{operation}}\`: when the timeout wins, the call keeps running and repeats its side effects if the caller retries. ${ADVICE} An exception fits only for background work that is meant to finish after the caller gave up.`,
      ignoredSignal: `\`Promise.race\` with {{timeout}} does not stop \`{{operation}}\`, and this call leaves out its \`{{parameter}}\` parameter, so it keeps running after the timeout wins and a retry overlaps it. ${ADVICE} An exception fits only for background work that is meant to finish after the caller gave up.`,
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    let scope;
    return {
      Program(node) {
        scope = {
          context,
          checkFetch: options.fetch !== false,
          nodeFetchTimeout: options.nodeFetchTimeout !== false,
          ...clientBindings(node),
          ...timeoutBindings(node),
        };
      },
      CallExpression(node) {
        const race = raceTimeout(scope, node);
        const losers = (race?.losers ?? []).flatMap((entry) => operationsIn(context, entry));
        for (const call of losers.filter((loser) => isAbandoned(scope, loser, race))) {
          const parameter = signalParameterOf(context, call.callee);
          context.report({
            node: call,
            messageId: parameter === undefined ? 'noSignal' : 'ignoredSignal',
            data: {
              timeout: race.timeout,
              operation: calleeText(context, call),
              parameter: parameter ?? '',
            },
          });
        }
      },
    };
  },
};
