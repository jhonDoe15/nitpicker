import { type TSESLint } from '@typescript-eslint/utils';
import { typedServices } from '../decided/facts.mts';
import { presenceHandlers } from './presence-checks.mts';

const FORMS =
  'Test presence with `!== undefined` or `!= null`, or default with `??`. An exception fits only when an empty string or `false` must take the same path as a missing value.';

export const rule: TSESLint.RuleModule<
  'presence' | 'fallback' | 'filter',
  readonly [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Report testing an optional string, boolean or type-parameter value for truthiness as a presence check, when the project shows an empty string, 0 or false is valid there',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      presence: `\`{{value}}\` may be an empty string or \`false\`, which this test treats as missing ({{evidence}}). ${FORMS}`,
      fallback: `\`{{value}} || {{fallback}}\` replaces an empty string or \`false\` too. ${FORMS}`,
      filter: `\`.filter({{predicate}})\` drops empty strings and \`false\` along with missing values ({{evidence}}). Filter with \`value !== undefined\` or \`value != null\`; an exception fits only when they must be dropped too.`,
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (!typedServices(services)) {
      return {};
    }
    return presenceHandlers(context, services);
  },
};
