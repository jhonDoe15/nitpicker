import { resolveConstant } from '../analysis/constant-resolution.mjs';
import { clientBindings, clientCall } from '../security/http/http-clients.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';
import {
  cleansUpInFunction,
  closesOverSignal,
  passesLifetimeOwner,
  signalParameterOf,
} from './operation-lifetime.mjs';
import { globalMemberCall } from './syntax-nodes.mjs';
import { timeoutBindings, timeoutOf } from './timeout-entries.mjs';

const CHAIN_METHODS = new Set(['then', 'catch', 'finally']);
const COMBINATORS = new Set(['all', 'allSettled', 'race', 'any']);
const MAX_DEPTH = 4;
const MAX_TEXT = 40;

const ADVICE =
  'Create an `AbortController`, abort it from the timeout path and pass `{ signal: controller.signal }` to the operation, or pass `AbortSignal.timeout(ms)` straight to an API that accepts `signal` and drop the race.';

function chainRoot(call) {
  const callee = unwrapped(call.callee);
  const inner =
    callee.type === 'MemberExpression' && CHAIN_METHODS.has(memberName(callee))
      ? unwrapped(callee.object)
      : undefined;
  return inner?.type === 'CallExpression' ? chainRoot(inner) : call;
}

function calleeText(context, call) {
  const text = context.sourceCode.getText(call.callee).replaceAll(/\s+/gu, ' ');
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}...` : text;
}

function operationsIn(scope, entry, depth = 0) {
  const { context } = scope;
  const target = unwrapped(resolveConstant(context, unwrapped(entry)));
  if (target?.type !== 'CallExpression' || depth > MAX_DEPTH) {
    return [];
  }
  const root = chainRoot(target);
  const combinator = [...COMBINATORS].find((name) =>
    globalMemberCall(context, root, 'Promise', name),
  );
  if (combinator !== undefined) {
    const list = unwrapped(resolveConstant(context, unwrapped(root.arguments[0])));
    return (list?.elements ?? []).flatMap((inner) =>
      inner === null || inner.type === 'SpreadElement' ? [] : operationsIn(scope, inner, depth + 1),
    );
  }
  return [root];
}

function isAbandoned(scope, call) {
  const { context } = scope;
  const callee = unwrapped(call.callee);
  const named = callee.type === 'Identifier' || callee.type === 'MemberExpression';
  return (
    named &&
    !globalMemberCall(context, call, 'Promise', 'resolve') &&
    !globalMemberCall(context, call, 'Promise', 'reject') &&
    clientCall(scope, call) === undefined &&
    !passesLifetimeOwner(context, call) &&
    !closesOverSignal(context, callee) &&
    !cleansUpInFunction(context, call)
  );
}

function raceTimeout(scope, node) {
  const list = unwrapped(resolveConstant(scope.context, unwrapped(node.arguments[0])));
  if (
    list?.type !== 'ArrayExpression' ||
    !globalMemberCall(scope.context, node, 'Promise', 'race')
  ) {
    return undefined;
  }
  const entries = list.elements.filter((entry) => entry !== null && entry.type !== 'SpreadElement');
  const timeouts = entries.map((entry) => timeoutOf(scope, entry));
  const timeout = timeouts.find((found) => found !== undefined);
  return timeout === undefined
    ? undefined
    : { timeout, losers: entries.filter((_, index) => timeouts[index] === undefined) };
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
        const losers = (race?.losers ?? []).flatMap((entry) => operationsIn(scope, entry));
        for (const call of losers.filter((loser) => isAbandoned(scope, loser))) {
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
