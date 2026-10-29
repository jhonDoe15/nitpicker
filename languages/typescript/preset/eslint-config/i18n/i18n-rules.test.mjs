import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { lintFixture } from '../../failure-messages/test-support/harness.mjs';
import { resolveLayout } from '../../layout.mjs';
import { i18nRuleNames, i18nRules } from './i18n-rules.mjs';
import { i18nPlugin } from './i18n-plugin.mjs';
import { i18nScopeConfigFor } from './i18n-scope.mjs';

const config = [
  { languageOptions: { parser: tseslint.parser } },
  ...(await i18nScopeConfigFor(resolveLayout())),
];
const filename = 'src/main/ui/panel.tsx';
const lint = (code) => lintFixture({ config, filename, code });
const ruleIds = (code) => lint(code).map(({ ruleId }) => ruleId);

function message(text, names = []) {
  const descriptor = `{ defaultMessage: ${JSON.stringify(text)}, description: 'Where it appears' }`;
  return `export const text = intl.formatMessage(${descriptor}, { ${names.join(', ')} });`;
}

const select = (name) => `{${name}, select, x {1} y {2} other {3}}`;

const firing = [
  [
    'enforce-default-message',
    "export const text = intl.formatMessage({ defaultMessage: label, description: 'Button' });",
    "export const text = intl.formatMessage({ defaultMessage: 'Save', description: 'Button' });",
  ],
  [
    'enforce-description',
    "export const text = intl.formatMessage({ defaultMessage: 'Save' });",
    "export const text = intl.formatMessage({ defaultMessage: 'Save', description: 'Button' });",
  ],
  ['enforce-placeholders', message('Hello {name}'), message('Hello {name}', ['name'])],
  [
    'no-complex-selectors',
    message(`${select('a')} ${select('b')} ${select('c')}`, ['a', 'b', 'c']),
    message(`${select('a')} ${select('b')}`, ['a', 'b']),
  ],
  ['no-invalid-icu', message('Hello {name'), message('Hello {name}', ['name'])],
  [
    'no-literal-string-in-jsx',
    'export const Label = () => <p>Save</p>;',
    "export const Label = () => <p><FormattedMessage defaultMessage='Save' description='Button' /></p>;",
  ],
  [
    'no-missing-icu-plural-one-placeholders',
    message('{n, plural, one {1 item} other {# items}}', ['n']),
    message('{n, plural, one {# item} other {# items}}', ['n']),
  ],
  [
    'no-multiple-plurals',
    message('{a, plural, one {# a} other {# as}} {b, plural, one {# b} other {# bs}}', ['a', 'b']),
    message('{a, plural, one {# a} other {# as}}', ['a']),
  ],
  ['no-multiple-whitespaces', message('Save  changes'), message('Save changes')],
  [
    'no-offset',
    message('{n, plural, offset:1 one {# other} other {# others}}', ['n']),
    message('{n, plural, =0 {none} one {# item} other {# items}}', ['n']),
  ],
  ['no-useless-message', message('{n, number}', ['n']), message('Total: {n, number}', ['n'])],
  ['prefer-full-sentence', message('Size: {n}MB', ['n']), message('Size: {n} MB', ['n'])],
  [
    'prefer-pound-in-plural',
    message('{n, plural, one {{n} item} other {# items}}', ['n']),
    message('{n, plural, one {# item} other {# items}}', ['n']),
  ],
];

describe('each enabled rule fires on a small fixture', () => {
  it('has a fixture for every enabled rule', () => {
    expect(firing.map(([name]) => name).toSorted()).toEqual(i18nRuleNames.toSorted());
  });

  it.each(firing)(
    '%s reports the banned form once and accepts the allowed form',
    (name, banned, allowed) => {
      expect(ruleIds(banned)).toEqual([`formatjs/${name}`]);
      expect(ruleIds(allowed)).toEqual([]);
    },
  );

  it.each(firing)('%s ends its message with the hint naming the allowed form', (name, banned) => {
    const [{ message: text }] = lint(banned);

    expect(text.endsWith(i18nRules[name].hint), text).toBe(true);
  });

  it('reports every unparsable message once, under no-invalid-icu', () => {
    expect(ruleIds(message('Hello {name'))).toEqual(['formatjs/no-invalid-icu']);
  });

  it('never offers an upstream fix or suggestion', () => {
    const findings = firing.flatMap(([, banned]) => lint(banned));
    expect(findings.map(({ ruleId, fix, suggestions }) => ({ ruleId, fix, suggestions }))).toEqual(
      findings.map(({ ruleId }) => ({ ruleId, fix: undefined, suggestions: undefined })),
    );
  });

  it('checks defineMessages, FormattedMessage and the message shorthand too', () => {
    expect(
      ruleIds("export const m = defineMessages({ save: { defaultMessage: 'Save' } });"),
    ).toEqual(['formatjs/enforce-description']);
    expect(ruleIds("export const m = defineMessage({ defaultMessage: 'Save' });")).toEqual([
      'formatjs/enforce-description',
    ]);
    expect(ruleIds("export const l = () => <FormattedMessage defaultMessage='Save' />;")).toEqual([
      'formatjs/enforce-description',
    ]);
  });

  it('flags a descriptor that has an id but no default message and no description', () => {
    expect(ruleIds("export const text = intl.formatMessage({ id: 'save' });")).toEqual([
      'formatjs/enforce-default-message',
      'formatjs/enforce-description',
    ]);
  });

  it('flags untranslated attribute text but not other attributes', () => {
    expect(ruleIds("export const i = () => <input placeholder='Name' />;")).toEqual([
      'formatjs/no-literal-string-in-jsx',
    ]);
    expect(
      ruleIds("export const i = () => <input className='wide' type='text' name='a' alt='b' />;"),
    ).toEqual([]);
  });
});

const projectChoices = [
  [
    'an explicit id',
    "export const text = intl.formatMessage({ id: 'profile.save', defaultMessage: 'Save', description: 'Button' });",
  ],
  [
    'a generated id',
    "export const text = intl.formatMessage({ id: 'aB3xYz', defaultMessage: 'Save', description: 'Button' });",
  ],
  ['a camel case placeholder', message('Hi {userName}', ['userName'])],
  ['an emoji', message('Done \u2705')],
  ['a plural without one', message('{n, plural, other {# items}}', ['n'])],
  ['a selectordinal', message('{n, selectordinal, one {# place} other {# place}}', ['n'])],
  [
    'a message call in JSX children',
    "export const a = () => <p>{intl.formatMessage({ defaultMessage: 'Save', description: 'Button' })}</p>;",
  ],
  ['a label property in an object', "export const option = { label: 'Save' };"],
];

describe('the choices that belong to the project stay off', () => {
  it.each(projectChoices)('does not flag %s', (_name, code) => {
    expect(ruleIds(code)).toEqual([]);
  });
});

describe('the plugin wrapper', () => {
  it('registers exactly the enabled rules', () => {
    expect(Object.keys(i18nPlugin.rules).toSorted()).toEqual(i18nRuleNames.toSorted());
  });

  it('ends every reachable message of a rule with its hint, joined by one full stop', () => {
    const rules = Object.entries(i18nRules).map(([name, { hint }]) => ({
      name,
      hint,
      texts: Object.entries(i18nPlugin.rules[name].meta.messages)
        .filter(([id]) => name === 'no-invalid-icu' || id !== 'parseError')
        .map(([, text]) => text),
    }));
    const messages = rules.flatMap(({ name, hint, texts }) =>
      texts.map((text) => ({ name, hint, text })),
    );

    expect(rules.map(({ name, texts }) => [name, texts.length > 0])).toEqual(
      rules.map(({ name }) => [name, true]),
    );
    expect(messages).not.toHaveLength(0);
    expect(messages.filter(({ text, hint }) => !text.endsWith(hint))).toEqual([]);
    expect(
      messages.filter(({ text, hint }) => !/[^\s.]\.?$/u.test(text.slice(0, -hint.length))),
    ).toEqual([]);
    expect(messages.filter(({ text }) => text.includes('..') || text.includes('\n'))).toEqual([]);
  });

  it('keeps each hint to one sentence and one example', () => {
    const hints = Object.entries(i18nRules);
    expect(hints).not.toHaveLength(0);
    expect(hints.filter(([, { hint }]) => hint.length >= 200).map(([name]) => name)).toEqual([]);
  });
});

describe('the false positives the wrapper removes', () => {
  it.each([
    ['a space kept by Prettier', "export const a = () => <p>{' '}</p>;"],
    ['punctuation', 'export const a = () => <p>-</p>;'],
    ['a slash', 'export const a = () => <p>/</p>;'],
    ['a number', 'export const a = () => <p>42</p>;'],
    ['a non-breaking space entity', 'export const a = () => <p>&nbsp;</p>;'],
    ['a numeric symbol entity', 'export const a = () => <p>&#8594;</p>;'],
    ['a symbol in an expression', "export const a = () => <p>{'\u2192'}</p>;"],
    ['a title that is a symbol', "export const a = () => <button title='×' />;"],
  ])('does not flag %s in JSX', (_name, code) => {
    expect(ruleIds(code)).toEqual([]);
  });

  it.each([
    ['text', 'export const a = () => <p>Save</p>;'],
    ['a letter entity', 'export const a = () => <p>&eacute;</p>;'],
    ['a numeric letter entity', 'export const a = () => <p>&#65;</p>;'],
    ['text with a number', 'export const a = () => <p>3 items</p>;'],
    ['a literal in an expression', "export const a = () => <p>{'Save'}</p>;"],
    ['a title', "export const a = () => <button title='Close' />;"],
  ])('still flags %s in JSX', (_name, code) => {
    expect(ruleIds(code)).toEqual(['formatjs/no-literal-string-in-jsx']);
  });

  const component = (attributes) =>
    `export const a = () => <FormattedMessage defaultMessage='Hi {name}' description='Greeting' ${attributes} />;`;

  it.each([
    ['a variable', 'values={extra}'],
    ['a call', 'values={valuesFor(user)}'],
    ['an object with the placeholder', 'values={{ name }}'],
    ['an object with a spread', 'values={{ ...extra }}'],
  ])('trusts values given as %s', (_name, attribute) => {
    expect(ruleIds(component(attribute))).toEqual([]);
  });

  it('still flags literal values that miss a placeholder', () => {
    expect(ruleIds(component('values={{ other }}'))).toEqual([
      'formatjs/enforce-placeholders',
      'formatjs/enforce-placeholders',
    ]);
    expect(ruleIds(component(''))).toEqual(['formatjs/enforce-placeholders']);
  });

  it.each(['{n}\u4ef6', '\u5171{n}\u4e2a', '{n}\uac1c', '{n}\u500b\u306e\u30d5\u30a1\u30a4\u30eb'])(
    'accepts a placeholder joined to a word of a script written without spaces: %s',
    (text) => {
      expect(ruleIds(message(text, ['n']))).toEqual([]);
    },
  );

  it('still flags a placeholder joined to a unit in a spaced script', () => {
    expect(ruleIds(message('{n}MB', ['n']))).toEqual(['formatjs/prefer-full-sentence']);
  });

  it('reports leading and trailing whitespace once, so both engines agree', () => {
    expect(ruleIds(message(' Save '))).toEqual(['formatjs/prefer-full-sentence']);
  });

  it('honours a per-call ignoreTag in the one rule that reports parse errors', () => {
    const call = (options) =>
      `export const t = intl.formatMessage({ defaultMessage: 'a <b>c', description: 'd' }, {}${options});`;

    expect(ruleIds(call(''))).toEqual(['formatjs/no-invalid-icu']);
    expect(ruleIds(call(', { ignoreTag: true }'))).toEqual([]);
    expect(ruleIds(call(', { ignoreTag: false }'))).toEqual(['formatjs/no-invalid-icu']);
  });

  it('names a non-empty literal for an empty default message or description', () => {
    const [{ message: empty }] = lint(
      "export const t = intl.formatMessage({ defaultMessage: '', description: 'd' });",
    );
    const [{ message: blank }] = lint(
      "export const t = intl.formatMessage({ defaultMessage: 'Save', description: '' });",
    );

    expect(empty).toBe(
      `\`defaultMessage\` has to be a non-empty string literal, or a template literal without variables${i18nRules['enforce-default-message'].hint}`,
    );
    expect(blank).toBe(
      `\`description\` has to be a non-empty string literal${i18nRules['enforce-description'].hint}`,
    );
  });

  it('puts every message on one line', () => {
    const [{ message: text }] = lint(
      "export const t = intl.formatMessage({ defaultMessage: label, description: 'd' });",
    );

    expect(text).not.toContain('\n');
  });
});
