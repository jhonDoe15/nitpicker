import { rule as booleanFlag } from '../rules/code-smells/boolean-flag-parameter.mjs';
import { rule as duplicates } from '../rules/code-smells/duplicate-string-literals.mjs';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { cases, typescriptRuleTester } from '../test-support/rule-tester.mjs';

const ruleTester = typescriptRuleTester();

const repeated = (value, times) =>
  Array.from({ length: times }, () => `use('${value}');`).join('\n');

ruleTester.run('no-duplicate-string-literals', duplicates, {
  valid: [
    ...cases([
      repeated('pending', 2),
      "const PENDING = 'pending'; use(PENDING); use(PENDING); use(PENDING);",
      repeated('ab', 3),
      repeated('open', 3),
      "switch (s) { case 'opened': break; } switch (t) { case 'opened': break; } switch (u) { case 'opened': break; }",
      "const a = { type: 'order-placed' }; const b = { type: 'order-placed' }; const c = { kind: 'order-placed' };",
      'const a = { pending: 1 }; const b = { pending: 2 }; const c = { pending: 3 };',
      'const a = html`<div>`; const b = html`<div>`; const c = html`<div>`;',
      repeated(', ', 3),
      repeated('...', 3),
      "import a from 'pkg'; import b from 'pkg'; export { c } from 'pkg';",
      "type A = 'read' | 'write'; type B = 'read' | 'write'; type C = 'read' | 'write';",
      'const a = { status: 1 }; const b = { status: 2 }; const c = { status: 3 };',
      'class A { status = 1; } class B { status = 2; } class C { status = 3; }',
      "'use strict'; 'use strict'; 'use strict';",
      "const a = require('pkg'); const b = require('pkg'); const c = require('pkg');",
      "enum A { X = 'value' } enum B { X = 'value' } enum C { X = 'value' }",
      "a['pending'] = 1; b['pending'] = 2; c?.['pending'];",
      "declare module 'orders-api' {} declare module 'orders-api' {} declare module 'orders-api' {}",
    ]),
    ...cases([
      "t('orders.title'); t('orders.title'); t('orders.title');",
      "i18n.t('orders.title'); i18next.t('orders.title'); this.$t('orders.title');",
      "translate('orders.title'); __('orders.title'); _t('orders.title');",
      "intl.formatMessage({ id: 'orders.title' }); intl.formatMessage({ id: 'orders.title' }); formatMessage({ id: 'orders.title' });",
      "useTranslation('checkout'); useTranslation('checkout'); getFixedT(null, 'checkout');",
    ]),
    {
      code: 'const a = <input type="text" />; const b = <input type="text" />; const c = <input type="text" />;',
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    },
    {
      code: "const a = <Trans i18nKey={'orders.title'} />; const b = <Trans i18nKey={'orders.title'} />; const c = <Trans i18nKey={'orders.title'} />;",
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    },
  ],
  invalid: [
    {
      code: repeated('pending', 3),
      errors: [{ messageId: 'repeated', data: { text: 'pending' }, line: 3 }],
    },
    {
      code: repeated('pending', 4),
      errors: [
        { messageId: 'repeated', line: 3 },
        { messageId: 'repeated', line: 4 },
      ],
    },
    {
      code: `${repeated('pending', 3)}\n${repeated('shipped', 3)}`,
      errors: [
        { messageId: 'repeated', data: { text: 'pending' } },
        { messageId: 'repeated', data: { text: 'shipped' } },
      ],
    },
    {
      code: "const a = { s: 'opened' }; const b = ['opened']; const c = 'opened';",
      errors: [{ messageId: 'repeated', data: { text: 'opened' } }],
    },
    {
      code: "t('orders.title'); label('orders.title'); label('orders.title'); label('orders.title');",
      errors: [{ messageId: 'repeated', data: { text: 'orders.title' } }],
    },
    {
      code: "t('orders.title', 'Orders list'); t('orders.title', 'Orders list'); t('x', 'Orders list');",
      errors: [{ messageId: 'repeated', data: { text: 'Orders list' } }],
    },
    {
      code: "intl.formatMessage({ id: 'orders.title' }, { name: 'shipped' }); use({ name: 'shipped' }); use('shipped');",
      errors: [{ messageId: 'repeated', data: { text: 'shipped' } }],
    },
    {
      code: 'use(`pending`); use(`pending`); use(`pending`);',
      errors: [{ messageId: 'repeated', data: { text: 'pending' } }],
    },
    {
      code: `use('${'x'.repeat(40)}'); use('${'x'.repeat(40)}'); use('${'x'.repeat(40)}');`,
      errors: [{ messageId: 'repeated', data: { text: `${'x'.repeat(30)}...` } }],
    },
  ],
});

const flagged = (code, name, fn) => ({
  code,
  errors: [{ messageId: 'flag', data: { name, function: fn } }],
});

ruleTester.run('no-boolean-flag-parameter', booleanFlag, {
  valid: cases([
    'export function render(options: { verbose: boolean }) { return options.verbose ? 1 : 0; }',
    'export function render({ verbose }: { verbose: boolean }) { return verbose ? 1 : 0; }',
    'function render(verbose: boolean) { return verbose ? 1 : 0; }',
    'export function render(mode: "loud" | "quiet") { return mode === "loud" ? 1 : 0; }',
    'export function isReady(name: string): boolean { return name !== ""; }',
    'function render(v: boolean) { return v ? 1 : 0; } export { other }; function other() {}',
    'export function render(...flags: boolean[]) { return flags; }',
    'export function render(verbose: boolean) { return { verbose }; }',
    'export function both(a: boolean, b: boolean) { return a && b; }',
    'export declare function render(loud: boolean): void;',
    'export function useToggle(initial: boolean) { return initial ? 1 : 0; }',
    'export function useFetch(url: string, enabled = true) { if (!enabled) return; load(url); }',
    'export function setOpen(open: boolean) { if (open) show(); else hide(); }',
    'export function of(value: boolean) { return value ? YES : NO; }',
    'export function isText(x: unknown, strict: boolean): x is string { return strict ? a(x) : b(x); }',
    'export class Panel { constructor(open: boolean) { if (open) show(); } }',
    'export class Panel { private draw(loud: boolean) { if (loud) shout(); } }',
    'class Panel { draw(loud: boolean) { if (loud) shout(); } }',
    'const render = (loud: boolean) => (loud ? 1 : 0);',
    'export const toggle = (value: boolean) => !value;',
  ]),
  invalid: [
    flagged(
      'export function render(name: string, loud: boolean) { return loud ? name : ""; }',
      'loud',
      'render',
    ),
    flagged('export function render(loud?: boolean) { if (loud) shout(); }', 'loud', 'render'),
    flagged(
      'export function render(loud: boolean | undefined) { if (!loud) return; shout(); }',
      'loud',
      'render',
    ),
    flagged(
      'export function render(loud = false) { return loud && ready ? 1 : 0; }',
      'loud',
      'render',
    ),
    flagged(
      'export default function render(loud: boolean) { return loud ? 1 : 0; }',
      'loud',
      'render',
    ),
    flagged('export default function (loud: boolean) { return loud ? 1 : 0; }', 'loud', 'default'),
    flagged(
      'function render(loud: boolean) { return loud ? 1 : 0; }\nexport { render };',
      'loud',
      'render',
    ),
    flagged('export const render = (loud: boolean) => (loud ? 1 : 0);', 'loud', 'render'),
    flagged(
      'export const render = function (loud: boolean) { if (loud) shout(); };',
      'loud',
      'render',
    ),
    flagged('export class Panel { draw(loud: boolean) { if (loud) shout(); } }', 'loud', 'draw'),
    flagged(
      'const render = (loud: boolean) => (loud ? 1 : 0);\nexport { render };',
      'loud',
      'render',
    ),
    {
      code: 'export function render(a: boolean, b: boolean) { if (a) x(); return b ? 1 : 0; }',
      errors: [{ messageId: 'flag' }, { messageId: 'flag' }],
    },
  ],
});

describe('no-duplicate-string-literals on a large file', () => {
  it('reports every repeat in linear time', () => {
    const lines = Array.from({ length: 20_000 }, () => "use('pending');");
    const linter = new Linter();
    const started = performance.now();
    const messages = linter.verify(lines.join('\n'), {
      plugins: { local: { rules: { duplicates } } },
      rules: { 'local/duplicates': 'error' },
    });
    expect(messages).toHaveLength(19_998);
    expect(performance.now() - started).toBeLessThan(8000);
  });
});
