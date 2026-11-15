import { presenceHandlers } from './presence-checks.mjs';

const FORMS =
  'Test presence with `!== undefined` or `!= null`, or default with `??`. An exception fits only when an empty string or `false` must take the same path as a missing value.';

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Report testing an optional string, boolean or unconstrained value for truthiness as a presence check',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      presence: `\`{{value}}\` may be an empty string or \`false\`, which this test treats as missing. ${FORMS}`,
      fallback: `\`{{value}} || {{fallback}}\` replaces an empty string or \`false\` too. ${FORMS}`,
      filter: `\`.filter({{predicate}})\` drops empty strings and \`false\` along with missing values. Filter with \`value !== undefined\` or \`value != null\`; an exception fits only when they must be dropped too.`,
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (services?.program === null || services?.program === undefined) {
      return {};
    }
    return presenceHandlers(context, services);
  },
};
