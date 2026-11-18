import type { TSESLint } from '@typescript-eslint/utils';
import { isEstreeConsumed } from '../../support/flow/consumed.mts';
import { filtersByTable, type TableFilter } from './columns.mts';
import { readMentions, type TableEntry } from './read-mentions.mts';

function isGuarded(entry: TableEntry, filter: TableFilter): boolean {
  return (
    [...entry.columns.keys()].some((key) => filter.columns.has(key)) ||
    [...entry.helpers].some((helper) => filter.helpers.has(helper))
  );
}

function filterText(filter: TableFilter): string {
  const columns = [...filter.columns.values()].map((column) => `\`${column}\``);
  const helpers = [...filter.helpers].map((helper) => `the helper \`${helper}\``);
  return [...columns, ...helpers].join(' or ');
}

type Options = [{ readonly orms?: readonly string[]; readonly filters?: readonly string[] }?];

export const rule: TSESLint.RuleModule<'unfiltered', Options> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Apply the project's soft-delete or visibility filter to every read of a table that uses one",
    },
    schema: [
      {
        type: 'object',
        properties: {
          orms: { type: 'array', items: { type: 'string' } },
          filters: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unfiltered: [
        'This reads `{{table}}` without the soft-delete or visibility filter that most reads of that table',
        'apply ({{filter}}), so trashed or hidden rows can reach the result.',
        'Add the filter, or call the project helper that adds it.',
        'An exception fits a trash, restore, purge or admin query that reads those rows on purpose.',
      ].join(' '),
    },
  },
  create(context) {
    const { orms = [], filters = [] } = context.options[0] ?? {};
    const byTable = filtersByTable(filters);
    if (orms.length === 0 || byTable.size === 0) {
      return {};
    }
    return {
      CallExpression(call) {
        const mentions = isEstreeConsumed(call)
          ? readMentions(call, orms, context.sourceCode.visitorKeys)
          : undefined;
        const missing = mentions?.acknowledged
          ? undefined
          : mentions?.tables.flatMap((entry) => {
              const filter = entry.table === undefined ? undefined : byTable.get(entry.table);
              return entry.table !== undefined && filter !== undefined && !isGuarded(entry, filter)
                ? [{ table: entry.table, filter }]
                : [];
            })[0];
        if (missing !== undefined) {
          context.report({
            node: call,
            messageId: 'unfiltered',
            data: { table: missing.table, filter: filterText(missing.filter) },
          });
        }
      },
    };
  },
};
