import { type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { filterSites, type Site } from './filter-sites.mts';
import { unescapedLeaf } from './filter-values.mts';

type Context = TSESLint.RuleContext<'unescapedValue', readonly unknown[]>;

function report(context: Context, { value, operator }: Site): void {
  const leaf = unescapedLeaf(context, value);
  if (leaf !== undefined) {
    context.report({
      node: leaf,
      messageId: 'unescapedValue',
      data: { value: context.sourceCode.getText(leaf), operator },
    });
  }
}

export const rule: TSESLint.RuleModule<'unescapedValue', []> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow passing user text to a LIKE, contains, startsWith or regex filter without escaping its wildcards',
    },
    schema: [],
    messages: {
      unescapedValue:
        'Escape `{{ value }}` before it goes into the `{{ operator }}` filter (`escapeSqlLikePattern({{ value }})` with `ESCAPE` where the dialect needs it, or `escapeRegExp` for a regex): `%`, `_`, `\\` and regex characters in it match other rows. Use a full-text or equality filter instead, or take an exception when wildcards are an intended feature of the input.',
    },
  },
  create(context) {
    return {
      Property(node: TSESTree.Property) {
        const site = filterSites.propertySite(node);
        if (site !== undefined) {
          report(context, site);
        }
      },
      CallExpression(node) {
        filterSites.callSites(node).forEach((site) => {
          report(context, site);
        });
      },
      TaggedTemplateExpression(node) {
        filterSites.templateSites(node).forEach((site) => {
          report(context, site);
        });
      },
    };
  },
};
