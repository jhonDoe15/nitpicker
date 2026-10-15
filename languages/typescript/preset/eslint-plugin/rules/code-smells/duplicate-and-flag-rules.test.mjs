import { rule as booleanFlag } from './boolean-flag-parameter.mjs';
import { rule as duplicates } from './duplicate-string-literals.mjs';
import { cases, createRuleTester } from '../support/rule-tester.mjs';

const ruleTester = createRuleTester();

const repeated = (value, times) =>
  Array.from({ length: times }, () => `use('${value}');`).join('\n');

ruleTester.run('no-duplicate-string-literals', duplicates, {
  valid: [
    ...cases([
      repeated('pending', 2),
      "const PENDING = 'pending'; use(PENDING); use(PENDING); use(PENDING);",
      repeated('ab', 3),
      repeated(', ', 3),
      repeated('...', 3),
      "import a from 'pkg'; import b from 'pkg'; export { c } from 'pkg';",
      "type A = 'read' | 'write'; type B = 'read' | 'write'; type C = 'read' | 'write';",
      'const a = { status: 1 }; const b = { status: 2 }; const c = { status: 3 };',
      'class A { status = 1; } class B { status = 2; } class C { status = 3; }',
      "'use strict'; 'use strict'; 'use strict';",
      "const a = require('pkg'); const b = require('pkg'); const c = require('pkg');",
      "enum A { X = 'value' } enum B { X = 'value' } enum C { X = 'value' }",
    ]),
    {
      code: 'const a = <input type="text" />; const b = <input type="text" />; const c = <input type="text" />;',
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
      code: "switch (s) { case 'open': break; } const a = { s: 'open' }; const b = ['open'];",
      errors: [{ messageId: 'repeated', data: { text: 'open' } }],
    },
    {
      code: `use('${'x'.repeat(40)}'); use('${'x'.repeat(40)}'); use('${'x'.repeat(40)}');`,
      errors: [{ messageId: 'repeated', data: { text: `${'x'.repeat(30)}...` } }],
    },
  ],
});

ruleTester.run('no-boolean-flag-parameter', booleanFlag, {
  valid: cases([
    'export function render(options: { verbose: boolean }) { return options; }',
    'export function render({ verbose }: { verbose: boolean }) { return verbose; }',
    'function render(verbose: boolean) { return verbose; }',
    'export function render(mode: "loud" | "quiet") { return mode; }',
    'export function isReady(name: string): boolean { return name !== ""; }',
    'function render(verbose: boolean) { return verbose; } export { other }; function other() {}',
    'export function render(...flags: boolean[]) { return flags; }',
    'export const render = (verbose: boolean) => verbose;',
  ]),
  invalid: [
    {
      code: 'export function render(name: string, loud: boolean) { return loud ? name : ""; }',
      errors: [{ messageId: 'flag', data: { name: 'loud', function: 'render' } }],
    },
    {
      code: 'export function render(loud?: boolean) { return loud; }',
      errors: [{ messageId: 'flag', data: { name: 'loud', function: 'render' } }],
    },
    {
      code: 'export function render(loud: boolean | undefined) { return loud; }',
      errors: [{ messageId: 'flag', data: { name: 'loud', function: 'render' } }],
    },
    {
      code: 'export function render(loud = false) { return loud; }',
      errors: [{ messageId: 'flag', data: { name: 'loud', function: 'render' } }],
    },
    {
      code: 'export default function render(loud: boolean) { return loud; }',
      errors: [{ messageId: 'flag', data: { name: 'loud', function: 'render' } }],
    },
    {
      code: 'export default function (loud: boolean) { return loud; }',
      errors: [{ messageId: 'flag', data: { name: 'loud', function: 'default' } }],
    },
    {
      code: 'function render(loud: boolean) { return loud; }\nexport { render };',
      errors: [{ messageId: 'flag', data: { name: 'loud', function: 'render' } }],
    },
    {
      code: 'export function render(a: boolean, b: boolean) { return a && b; }',
      errors: [{ messageId: 'flag' }, { messageId: 'flag' }],
    },
    {
      code: 'export declare function render(loud: boolean): void;',
      errors: [{ messageId: 'flag' }],
    },
  ],
});
