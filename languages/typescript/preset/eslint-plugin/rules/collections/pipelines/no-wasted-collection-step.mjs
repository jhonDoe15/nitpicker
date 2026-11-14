import { filterFirst, findAsBoolean, lengthCheck, mapFlat } from './array-steps.mjs';
import { promiseSteps } from './promise-methods.mjs';
import { fallbackSpread, uselessSpread } from './spreads.mjs';

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
};

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow collection and promise steps that copy for nothing or walk the data twice, where a single step says the same',
    },
    schema: [],
    messages: wastedStepMessages,
  },
  create(context) {
    const { sourceCode } = context;
    function report(descriptor) {
      if (descriptor !== undefined) {
        context.report(descriptor);
      }
    }
    return {
      MemberExpression(member) {
        report(filterFirst(member));
      },
      CallExpression(call) {
        report(findAsBoolean(call) ?? mapFlat(call));
        for (const step of promiseSteps(call)) {
          report(step);
        }
      },
      ArrayExpression(array) {
        report(uselessSpread(array));
      },
      'ObjectExpression > SpreadElement'(spread) {
        report(fallbackSpread(spread));
      },
      LogicalExpression(logical) {
        report(lengthCheck(sourceCode, logical));
      },
    };
  },
};
