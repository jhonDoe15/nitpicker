import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant } from '../analysis/constant-resolution.mts';
import { type ClientScope, clientBindings, isClientCall } from '../security/http/http-clients.mts';
import { type Context, unwrapped } from '../security/security-values.mts';
import {
  type Race,
  cleansUp,
  closesOverSignal,
  passesLifetimeOwner,
  signalParameterOf,
} from './operations/operation-lifetime.mts';
import { combinedEntries, operationsIn } from './operations/race-operations.mts';
import { globalMemberCall, isGlobalTimerCall } from './operations/syntax-nodes.mts';
import {
  type TimeoutBindings,
  isTimer,
  timeoutBindings,
  timeoutOf,
} from './operations/timeout-entries.mts';

type Scope = ClientScope & TimeoutBindings;
type RaceTimeout = Race & { readonly timeout: string; readonly losers: readonly TSESTree.Node[] };
type Options = readonly [Readonly<Record<string, unknown>>?];

const MAX_TEXT = 40;

const ADVICE =
  'Create an `AbortController`, abort it from the timeout path and pass `{ signal: controller.signal }` to the operation, or pass `AbortSignal.timeout(ms)` straight to an API that accepts `signal` and drop the race.';

function calleeText(context: Context, call: TSESTree.CallExpression): string {
  const text = context.sourceCode.getText(call.callee).replaceAll(/\s+/gu, ' ');
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}...` : text;
}

function isAbandoned(scope: Scope, call: TSESTree.CallExpression, race: Race): boolean {
  const { context } = scope;
  const callee = unwrapped(call.callee);
  const named =
    callee.type === AST_NODE_TYPES.Identifier || callee.type === AST_NODE_TYPES.MemberExpression;
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

function raceTimeout(scope: Scope, node: TSESTree.CallExpression): RaceTimeout | undefined {
  const { context } = scope;
  const list = unwrapped(resolveConstant(context, unwrapped(node.arguments[0])));
  if (
    list?.type !== AST_NODE_TYPES.ArrayExpression ||
    !globalMemberCall(context, node, 'Promise.race')
  ) {
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

export const rule: TSESLint.RuleModule<'noSignal' | 'ignoredSignal', Options> = {
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
    const options: Readonly<Record<string, unknown>> = context.options[0] ?? {};
    const { fetch: fetchOption, nodeFetchTimeout: nodeOption } = options;
    let scope: Scope | undefined;
    return {
      Program(node) {
        scope = {
          context,
          checkFetch: fetchOption !== false,
          nodeFetchTimeout: nodeOption !== false,
          ...clientBindings(node),
          ...timeoutBindings(node),
        };
      },
      CallExpression(node) {
        const current = scope;
        if (current === undefined) {
          return;
        }
        const race = raceTimeout(current, node);
        if (race === undefined) {
          return;
        }
        const losers = race.losers.flatMap((entry) => operationsIn(context, entry));
        for (const call of losers.filter((loser) => isAbandoned(current, loser, race))) {
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
