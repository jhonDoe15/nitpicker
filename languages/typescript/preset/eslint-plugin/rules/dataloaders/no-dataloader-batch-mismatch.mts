import type { TSESLint } from '@typescript-eslint/utils';
import { batchOf, returnedValues } from './batch-functions.mts';
import { problemsOf } from './batch-values.mts';

const FORM =
  'Build the result by mapping over the keys with one entry per key in the same order: `const byId = new Map(rows.map((row) => [row.id, row])); return keys.map((key) => byId.get(key) ?? null);` (or an `Error` for a key with no row).';

export const rule: TSESLint.RuleModule<'empty' | 'lookup' | 'unmapped'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a DataLoader batch function to return one entry per key, in key order',
    },
    schema: [],
    messages: {
      empty: `This batch function returns an empty array: a DataLoader needs exactly one entry per key, so callers get nothing (or the batch fails) when no row matched. ${FORM}`,
      lookup: `This batch function asserts that a lookup for each key succeeds: a key with no row (a deleted record) gives \`undefined\` that reaches the caller as a value, or throws and fails every caller of the batch. ${FORM}`,
      unmapped: `This batch function returns the rows of a query as they come instead of one entry per key in the order of the keys: values reach the wrong callers and a missing row shifts every entry after it. ${FORM}`,
    },
  },
  create(context) {
    return {
      NewExpression(construct) {
        const batch = batchOf(construct, context);
        if (batch === undefined) {
          return;
        }
        for (const { kind, node } of problemsOf(returnedValues(batch.fn), batch.keys, context)) {
          context.report({ node, messageId: kind });
        }
      },
    };
  },
};
