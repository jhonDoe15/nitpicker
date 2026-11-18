import type { TSESLint } from '@typescript-eslint/utils';
import { optionalReporter } from '../../support/optional-report.mts';
import { filterFirst, findAsBoolean, lengthCheck, mapFlat } from './array-steps.mts';
import { promiseSteps } from './promise-methods.mts';
import { fallbackSpread, uselessSpread } from './spreads.mts';

type MessageId = keyof typeof wastedStepMessages;

const wastedStepMessages = {
  filterFirst:
    '`filter(...)` builds a whole array here only to take its first item. Use `find(...)`, which stops at the first match.',
  findAsBoolean:
    '`find(...)` is only tested for a match here. Use `some(...)`, which says so and also counts a match whose value is falsy.',
  mapFlat:
    '`map(...).flat()` walks the items twice and builds an array in between. Use `flatMap(...)`.',
  uselessSpread:
    'This spread copies {{what}} into a new array. Drop the spread and use the value itself.',
  fallbackInSpread:
    'Spreading `undefined` or `null` adds nothing, so the `{{operator}} {}` fallback is not needed: spread the value itself.',
  lengthCheck:
    '`{{method}}` already answers {{answer}} for an empty array, so this length check adds nothing. Drop it.',
  singlePromise:
    '`Promise.{{method}}` over one promise only waits for that promise. Write {{form}} instead.',
  awaitInPromiseMethod:
    'This `await` waits for its promise before `Promise.{{method}}` sees it, so the promises no longer run together. Pass the promise without `await`.',
  dropAwait: 'Remove the `await` so this promise starts together with the others.',
};

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    hasSuggestions: true,
    docs: {
      description:
        'Disallow collection and promise steps that copy for nothing or walk the data twice, where a single step says the same',
    },
    schema: [],
    messages: wastedStepMessages,
  },
  create(context) {
    const report = optionalReporter(context);
    return {
      MemberExpression(member) {
        report(filterFirst(member));
      },
      CallExpression(call) {
        report(findAsBoolean(context, call) ?? mapFlat(context, call));
        for (const step of promiseSteps(context, call)) {
          report(step);
        }
      },
      ArrayExpression(array) {
        report(uselessSpread(context, array));
      },
      'ObjectExpression > SpreadElement'(spread) {
        report(fallbackSpread(context, spread));
      },
      LogicalExpression(logical) {
        report(lengthCheck(context, logical));
      },
    };
  },
};
