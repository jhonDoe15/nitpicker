import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { rule as duplicateLiterals } from '../code-smells/duplicate-string-literals.mjs';
import { rule as accumulatorSpread } from '../loops/no-accumulator-spread-in-reduce.mjs';

const STATUS = "type Status = 'pending' | 'on-hold' | 'shipped';";
const ORDER = 'type Order = { readonly status: Status; readonly to?: Status };';

const FIXTURES = {
  'union-values.ts': [
    STATUS,
    ORDER,
    "export function hold(order: Order): Order { return { status: 'on-hold', to: 'on-hold' }; }",
    "export function held(order: Order): boolean { return order.status === 'on-hold'; }",
    "export function next(status: Status): Status { return status === 'pending' ? 'on-hold' : status; }",
  ].join('\n'),
  'string-values.ts': [
    "export function first(text: string): boolean { return text === 'on-hold'; }",
    "export function second(text: string): boolean { return text !== 'on-hold'; }",
    "export function third(): string { return 'on-hold'; }",
  ].join('\n'),
  'fixed-record.ts': [
    STATUS,
    ORDER,
    'type Counts = Readonly<Record<Status, number>>;',
    'export function count(orders: readonly Order[]): Counts {',
    '  return orders.reduce<Counts>(',
    '    (counts: Counts, order): Counts => ({ ...counts, [order.status]: counts[order.status] + 1 }),',
    "    { pending: 0, 'on-hold': 0, shipped: 0 },",
    '  );',
    '}',
  ].join('\n'),
  'open-record.ts': [
    'type Counts = Readonly<Record<string, number>>;',
    'export function count(words: readonly string[]): Counts {',
    '  return words.reduce<Counts>((counts: Counts, word): Counts => ({ ...counts, [word]: 1 }), {});',
    '}',
    'export function all(lists: readonly (readonly number[])[]): readonly number[] {',
    '  return lists.reduce<readonly number[]>((all, list) => [...all, ...list], []);',
    '}',
  ].join('\n'),
};

describe('typed exemptions of the duplicate literal and accumulator spread rules', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nitpicker-checked-types-'));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(path.join(root, 'src'));
  for (const [name, code] of Object.entries(FIXTURES)) {
    writeFileSync(path.join(root, 'src', name), `${code}\n`);
  }
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        lib: ['ES2022'],
        types: [],
      },
      include: ['src/**/*'],
    }),
  );
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { project: './tsconfig.json', tsconfigRootDir: root },
        },
        plugins: {
          nitpicker: { rules: { duplicates: duplicateLiterals, spread: accumulatorSpread } },
        },
        rules: { 'nitpicker/duplicates': 'error', 'nitpicker/spread': 'error' },
      },
    ],
  });

  async function findings(name) {
    const [result] = await eslint.lintFiles([path.join(root, 'src', name)]);
    return result.messages.map((message) => `${message.ruleId}:${message.line}`);
  }

  it('accepts repeated values of a string literal union, which the compiler checks', async () => {
    expect(await findings('union-values.ts')).toEqual([]);
  });

  it('rejects a value repeated where the type is plain string', async () => {
    expect(await findings('string-values.ts')).toEqual(['nitpicker/duplicates:3']);
  });

  it('accepts spreading an accumulator whose keys are a fixed set', async () => {
    expect(await findings('fixed-record.ts')).toEqual([]);
  });

  it('rejects spreading an accumulator that grows with the list', async () => {
    expect(await findings('open-record.ts')).toEqual(['nitpicker/spread:3', 'nitpicker/spread:6']);
  });
});
