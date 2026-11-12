import { arrayMembership } from './array-membership.mjs';
import { keyedLookup } from './keyed-lookup.mjs';
import { sortedExtreme } from './sorted-extreme.mjs';

const EXCEPTION = 'An exception fits only for a list that always stays a handful of items.';

const costlyCollectionMessages = {
  arrayAsSet: `\`{{name}}\` is appended to and searched with \`{{method}}\`, so every search scans the whole array. Keep it in a \`Set\`: \`add\` to append and \`has\` to test (\`[...set]\` gives the items back in insertion order). ${EXCEPTION}`,
  lookupInLoop: `\`{{name}}.{{method}}\` compares \`{{key}}\` against every item, once per iteration, item or event. Build a \`Map\` keyed by \`{{key}}\` once, outside the loop or handler, and use \`get\` (for \`some\`, a \`Set\` of keys and \`has\`). ${EXCEPTION}`,
  sortForExtreme: `\`{{method}}\` sorts the whole array only to take its first or last element. Take the smallest or largest in one pass: \`xs.reduce((best, x) => (compare(x, best) < 0 ? x : best))\`, or \`Math.min\`/\`Math.max\` for a few numbers. ${EXCEPTION}`,
};

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow collection forms that have a cheaper equivalent: an array used as a set, a keyed find in a loop, and a sort to take one end',
    },
    schema: [],
    messages: costlyCollectionMessages,
  },
  create(context) {
    const { sourceCode } = context;
    function report(descriptor) {
      if (descriptor !== undefined) {
        context.report(descriptor);
      }
    }
    return {
      VariableDeclarator(declarator) {
        report(arrayMembership(sourceCode, declarator));
      },
      CallExpression(call) {
        report(keyedLookup(sourceCode, call) ?? sortedExtreme(sourceCode, call));
      },
    };
  },
};
