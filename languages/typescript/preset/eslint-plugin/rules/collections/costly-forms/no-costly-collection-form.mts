import type { TSESLint } from '@typescript-eslint/utils';
import { suggestible } from '../../../fixes/support/descriptors.mts';
import { optionalReporter } from '../../support/optional-report.mts';
import { arrayMembership } from './array-membership.mts';
import { keyedLookup } from './keyed-lookup.mts';
import { sortedExtreme } from './sorted-extreme.mts';
import { setFix } from './fixes/set/set-fix.mts';

const EXCEPTION = 'An exception fits only for a list that always stays a handful of items.';

type MessageId = keyof typeof costlyCollectionMessages;

const costlyCollectionMessages = {
  arrayAsSet: `\`{{name}}\` is appended to and searched with \`{{method}}\`, so every search scans the whole array. Keep it in a \`Set\`: \`add\` to append and \`has\` to test (\`[...set]\` gives the items back in insertion order). ${EXCEPTION}`,
  lookupInLoop: `\`{{name}}.{{method}}\` compares \`{{key}}\` against every item, once per iteration, item or event. Build a \`Map\` keyed by \`{{key}}\` once, outside the loop or handler, and use \`get\` (for \`some\`, a \`Set\` of keys and \`has\`). ${EXCEPTION}`,
  useSet: 'Keep the items in a `Set`: `new Set<T>()`, `add`, `has` and `size`.',
  sortForExtreme: `\`{{method}}\` sorts the whole array only to take its first or last element. Take the smallest or largest in one pass: \`xs.reduce((best, x) => (compare(x, best) < 0 ? x : best))\`, or \`Math.min\`/\`Math.max\` for a few numbers. ${EXCEPTION}`,
};

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: {
      description:
        'Disallow collection forms that have a cheaper equivalent: an array used as a set, a keyed find in a loop, and a sort to take one end',
    },
    schema: [],
    messages: costlyCollectionMessages,
  },
  create(context) {
    const { sourceCode } = context;
    const report = optionalReporter(context);
    return {
      VariableDeclarator(declarator) {
        const finding = arrayMembership(sourceCode, declarator);
        if (finding !== undefined) {
          const plan = setFix(context, declarator);
          report(suggestible<MessageId>(finding, { messageId: 'useSet', plan }));
        }
      },
      CallExpression(call) {
        report(keyedLookup(sourceCode, call) ?? sortedExtreme(sourceCode, call));
      },
    };
  },
};
