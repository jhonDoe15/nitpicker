import {
  dropStaticJsxValues,
  dropTagIgnoringCalls,
  dropTextWithoutLetters,
  dropSpacelessScriptMessages,
} from './i18n-filters.mjs';

export const i18nRules = {
  'enforce-default-message': {
    setting: ['error', 'literal'],
    messages: {
      defaultMessageLiteral:
        '`defaultMessage` has to be a non-empty string literal, or a template literal without variables',
    },
    hint: `. Write the text as a literal, as in \`defaultMessage: 'Save changes'\`, so extraction can collect it.`,
  },
  'enforce-description': {
    setting: ['error', 'literal'],
    messages: { enforceDescriptionLiteral: '`description` has to be a non-empty string literal' },
    hint: `. Say where the message appears, as in \`description: 'Button that saves the profile form'\`.`,
  },
  'enforce-placeholders': {
    setting: 'error',
    filters: [dropStaticJsxValues],
    hint: ` Pass every placeholder a value, as in \`formatMessage(descriptor, { name })\`, and drop unused values.`,
  },
  'no-complex-selectors': {
    setting: 'error',
    hint: `. Split the message so it flattens to at most 20 sentences.`,
  },
  'no-invalid-icu': {
    setting: 'error',
    ownsParseErrors: true,
    filters: [dropTagIgnoringCalls],
    hint: '. Close every `{`, and give each `plural` and `select` an `other` branch.',
  },
  'no-literal-string-in-jsx': {
    setting: 'error',
    filters: [dropTextWithoutLetters],
    hint: `. Wrap the text in \`<FormattedMessage defaultMessage="Save" description="Form button" />\`.`,
  },
  'no-missing-icu-plural-one-placeholders': {
    setting: 'error',
    hint: ` Write \`#\` for the count, as in \`one {# item}\`.`,
  },
  'no-multiple-plurals': {
    setting: 'error',
    hint: `. Split it into one message per count.`,
  },
  'no-multiple-whitespaces': {
    setting: 'error',
    hint: `. Use single spaces; layout spacing belongs in the markup.`,
  },
  'no-offset': {
    setting: 'error',
    hint: `. Write each case out, as in \`=0 {none} one {# item} other {# items}\`.`,
  },
  'no-useless-message': {
    setting: 'error',
    hint: ` Use \`<FormattedNumber>\`, \`<FormattedDate>\`, \`<FormattedTime>\` or the matching \`intl.format*\` call.`,
  },
  'prefer-full-sentence': {
    setting: 'error',
    filters: [dropSpacelessScriptMessages],
    hint: `. Write the whole sentence in one message, and format a unit as \`{size, number, ::unit/megabyte}\`.`,
  },
  'prefer-pound-in-plural': {
    setting: 'error',
    hint: ` Write \`#\` for the count, as in \`one {# item}\`.`,
  },
};

export const i18nRuleNames = Object.keys(i18nRules);

export const i18nRuleIds = i18nRuleNames.map((name) => `formatjs/${name}`);

export const i18nOffRules = [
  'blocklist-elements',
  'enforce-id',
  'enforce-message-types',
  'enforce-plural-rules',
  'no-camel-case',
  'no-emoji',
  'no-id',
  'no-literal-string-in-object',
  'prefer-formatted-message',
];
