import { createTypedCases } from './test-support/typed-cases.mjs';
import { rule } from '../no-forwarding-wrapper.mjs';

const { tester, typed, javascriptCase } = createTypedCases();

const target = 'target(value: number): number { return value + 1; }';
const alias = 'alias(value: number): number { return this.target(value); }';
const errors = [{ messageId: 'forwardingMethod', data: { name: 'alias', target: 'target' } }];

tester.run('same-owner forwarding aliases', rule, {
  valid: [
    'class Owner { target = callback; target(value: number): number { return value; } alias(value: number): number { return this.target(value); } }',
    'class Owner { constructor(callback: (value: number) => number) { this.target = callback; } target(value: number): number { return value; } alias(value: number): number { return this.target(value); } }',

    `class Owner { ${target} alias(value: string): number { return this.target(Number(value)); } }`,
    `class Owner { ${target} alias(value: number): number | undefined { return this.target(value); } }`,
    `class Owner { ${target} alias(value: number): number { return this.target(value + 1); } }`,
    `class Base { ${target} } class Owner extends Base { ${alias} }`,
    `interface Contract { alias(value: number): number; } class Owner implements Contract { ${target} ${alias} }`,
    `class Owner { ${target} @decorator ${alias} }`,
    `class Owner { ${target} /** @deprecated compatibility */ ${alias} }`,
    `class Owner { ${target} of(value: number): number { return this.target(value); } }`,
    `class Owner { ${target} alias(value: number): number { return other.target(value); } }`,
    `class Owner { ${target} alias(value: number): number { return this.alias(value); } }`,
    'class Owner { target(value: string): string; target(value: number): number; target(value: string | number): string | number { return value; } alias(value: number): number { return this.target(value); } }',
    `class Owner { ${target} async alias(value: number): Promise<number> { return this.target(value); } }`,
    'class Owner { target(value: number = 1): number { return value; } alias(value: number): number { return this.target(value); } }',
    'class Owner { target(value: number): number { return value; } alias(value: number = 1): number { return this.target(value); } }',
    'class Owner { target(...values: number[]): number { return values.length; } alias(...values: number[]): number { return this.target(...values); } }',
    'class Owner { target<T>(value: T): T { return value; } alias(value: number): number { return this.target(value); } }',
  ].map((code) => typed(code)),
  invalid: [
    typed(`class Owner { ${target} ${alias} }`, errors),
    typed(`class Owner { ${target} private ${alias} }`, errors),
    typed(`const owner = { ${target}, ${alias} };`, errors),
    typed(
      'class Owner { target(): number { return 1; } alias(): number { return this.target(); } }',
      errors,
    ),
    javascriptCase(
      'class Owner {\n/** @param {number} value */\ntarget(value) { return value + 1; }\n/** @param {number} value */\nalias(value) { return this.target(value); }\n}',
      errors,
    ),
  ],
});
