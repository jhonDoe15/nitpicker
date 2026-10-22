import tseslint from 'typescript-eslint';
import { resolveLayout } from '../../../layout.mjs';
import { i18nScopeConfigFor } from '../i18n-scope.mjs';

const i18nConfig = [
  { languageOptions: { parser: tseslint.parser } },
  ...(await i18nScopeConfigFor(resolveLayout())),
];

function i18nCase([name, banned, allowed]) {
  return {
    name: `i18n: ${name}`,
    config: i18nConfig,
    filename: 'src/main/ui/fixture.tsx',
    banned,
    allowed,
  };
}

function message(text, names = '') {
  const descriptor = `{ defaultMessage: '${text}', description: 'Where it appears' }`;
  return `export const text = intl.formatMessage(${descriptor}, { ${names} });`;
}

const withoutDescription = "export const text = intl.formatMessage({ defaultMessage: 'Save' });";
const withoutDefaultMessage = "export const text = intl.formatMessage({ id: 'save' });";
const literalText = 'export const Label = () => <p>Save</p>;';

export const i18nFailureMessageCases = [
  ['missing description names a description', withoutDescription, 'description:'],
  ['missing default message names a literal', withoutDefaultMessage, 'defaultMessage:'],
  ['literal JSX text names FormattedMessage', literalText, '<FormattedMessage'],
  ['missing placeholder value names the values argument', message('Hi {name}'), '{ name }'],
  ['invalid ICU names the other branch', message('Hi {name'), 'other'],
  [
    'hard-coded one names the pound sign',
    message('{n, plural, one {1 item} other {# items}}', 'n'),
    '`#`',
  ],
  [
    'count repeated in the plural names the pound sign',
    message('{n, plural, one {{n} item} other {# items}}', 'n'),
    '`#`',
  ],
  [
    'plural offset names the written-out cases',
    message('{n, plural, offset:1 other {#}}', 'n'),
    '=0 {none}',
  ],
  [
    'two plurals name one message per count',
    message('{a, plural, other {#}} {b, plural, other {#}}', 'a, b'),
    'one message per count',
  ],
  [
    'a value-only message names the Formatted components',
    message('{n, number}', 'n'),
    'FormattedNumber',
  ],
  [
    'placeholder joined to a unit names the number skeleton',
    message('{n}MB', 'n'),
    '::unit/megabyte',
  ],
  ['leading space names the whole sentence', message(' Save'), 'whole sentence'],
  ['double space names single spaces', message('Save  now'), 'single spaces'],
].map(i18nCase);
