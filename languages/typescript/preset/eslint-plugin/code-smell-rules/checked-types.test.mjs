import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { rule as duplicateLiterals } from '../rules/code-smells/duplicate-string-literals.mjs';
import { rule as accumulatorSpread } from '../rules/loops/no-accumulator-spread-in-reduce.mjs';

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
  'fixed-record-loop.ts': [
    STATUS,
    ORDER,
    'type Counts = Readonly<Record<Status, number>>;',
    'export function count(orders: readonly Order[]): Counts {',
    "  let counts: Counts = { pending: 0, 'on-hold': 0, shipped: 0 };",
    '  for (const order of orders) {',
    '    counts = { ...counts, [order.status]: counts[order.status] + 1 };',
    '  }',
    '  return counts;',
    '}',
  ].join('\n'),
  'open-record-loop.ts': [
    'type Counts = Readonly<Record<string, number>>;',
    'export function count(words: readonly string[]): Counts {',
    '  let counts: Counts = {};',
    '  for (const word of words) {',
    '    counts = { ...counts, [word]: 1 };',
    '  }',
    '  return counts;',
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
  'concat.ts': [
    'export function text(parts: string[]) {',
    "  let joined = '';",
    '  for (const part of parts) { joined = joined.concat(part); }',
    "  return parts.reduce((all, part) => all.concat(part), '') + joined;",
    '}',
    'export function lists(groups: number[][]) {',
    '  let all: number[] = [];',
    '  for (const group of groups) { all = all.concat(group); }',
    '  return groups.reduce((acc: number[], group) => acc.concat(group), all);',
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

  it.each([
    ['spreading an accumulator whose keys are a fixed set', 'fixed-record.ts', []],
    ['a loop copying an accumulator whose keys are a fixed set', 'fixed-record-loop.ts', []],
    ['a loop copying an open accumulator', 'open-record-loop.ts', ['nitpicker/spread:5']],
    [
      'spreading an open accumulator',
      'open-record.ts',
      ['nitpicker/spread:3', 'nitpicker/spread:6'],
    ],
    [
      'concatenating onto an array but not onto a string',
      'concat.ts',
      ['nitpicker/spread:8', 'nitpicker/spread:9'],
    ],
  ])('reports %s only when it grows with the list', async (_name, file, expected) => {
    expect(await findings(file)).toEqual(expected);
  });
});
