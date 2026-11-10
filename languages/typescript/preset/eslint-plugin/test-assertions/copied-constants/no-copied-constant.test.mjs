import { Linter } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rule } from './no-copied-constant.mjs';

const SOURCES = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] }, types: [], lib: ['ES2022'] },
  }),
  'src/limits.ts': [
    'export const MAX_ITEMS = 50;',
    "export const DEFAULT_REGION = 'eu-west-1' as const;",
    'export const MIN_BALANCE = -25;',
    'export const RETRY_LIMIT = 2;',
    "export const SHORT = 'ab';",
    'const PAGE_SIZE = 20;',
    'const hidden = 77;',
    'export { PAGE_SIZE, hidden };',
    'export const maxDepth = 9;',
    'export const TIMEOUT_MS = 5_000;',
    'export const LIMITS = { MAX: 3 };',
    'export function limit() { return MAX_ITEMS; }',
  ].join('\n'),
  'src/index.ts': "export * from './limits';\nexport { ROLE as ADMIN_ROLE } from './roles';",
  'src/roles.ts': "export const ROLE = 'administrator';",
  'src/other.ts': 'export const OTHER_LIMIT = 50;',
  'src/same.ts': 'export const BATCH_SIZE = 50;',
  'src/paging.ts': [
    'export class Paging {',
    '  static readonly PAGE_LIMIT = 40;',
    "  private static readonly SECRET_KEY = 'hidden-key';",
    '  static readonly lowerName = 41;',
    '  static PAGE_FLOOR = 42;',
    '  readonly PAGE_CEILING = 43;',
    '}',
    "class Local { static readonly LOCAL_KEY = 'local-key'; }",
    'export { Local as Shared };',
  ].join('\n'),
  'test/helpers/values.ts': 'export const HELPER_LIMIT = 123;',
};

let root;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'nitpicker-copied-constants-'));
  for (const [file, text] of Object.entries(SOURCES)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function lint(code, file = 'test/limits.test.ts') {
  const config = {
    files: ['**/*.{ts,js}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { local: { rules: { 'no-copied-constant': rule } } },
    rules: { 'local/no-copied-constant': 'error' },
  };
  return new Linter({ cwd: root }).verify(code, config, { filename: path.join(root, file) });
}

function reported(code, file) {
  return lint(code, file).map(({ line, message }) => ({ line, message }));
}

describe('no-copied-constant', () => {
  it('reports a number and a string a test copies from an imported module', () => {
    const messages = reported(
      [
        "import { limit } from '../src/limits';",
        "it('caps the cart', () => {",
        '  expect(limit()).toBe(50);',
        "  expect(region()).toBe('eu-west-1');",
        '});',
      ].join('\n'),
    );

    expect(messages.map(({ line }) => line)).toEqual([3, 4]);
    expect(messages[0].message).toBe(
      'This literal copies MAX_ITEMS from ../src/limits: when MAX_ITEMS changes, the test keeps checking the old value or stops testing the case it was written for. Use MAX_ITEMS (or an expression on it, such as MAX_ITEMS + 1). If the value is a contract the test pins on purpose, assert it next to the constant: expect(MAX_ITEMS).toBe(50).',
    );
    expect(messages[1].message).toBe(
      'This literal copies DEFAULT_REGION from ../src/limits: when DEFAULT_REGION changes, the test keeps checking the old value or stops testing the case it was written for. Use DEFAULT_REGION (or build the text from it). If the value is a contract the test pins on purpose, assert it next to the constant: expect(DEFAULT_REGION).toBe("eu-west-1").',
    );
  });

  it('reports negative numbers, separators, export lists, barrels and aliased re-exports', () => {
    const messages = reported(
      [
        "import * as api from '@/index';",
        'expect(balance()).toBe(-25);',
        'expect(timeout()).toBe(5000);',
        'expect(page()).toHaveLength(20);',
        "expect(role()).toBe('administrator');",
      ].join('\n'),
    );

    expect(messages.map(({ message }) => message.split(' from ')[0])).toEqual([
      'This literal copies MIN_BALANCE',
      'This literal copies TIMEOUT_MS',
      'This literal copies PAGE_SIZE',
      'This literal copies ADMIN_ROLE',
    ]);
  });

  it('names every constant that holds the value and every module it comes from', () => {
    const [{ message }] = reported(
      [
        "import { limit } from '../src/limits';",
        "import { OTHER_LIMIT } from '../src/other';",
        "import '../src/same';",
        'it("works", () => { expect(limit()).toBe(50); });',
      ].join('\n'),
    );

    expect(message).toBe(
      'This literal copies BATCH_SIZE (and MAX_ITEMS, OTHER_LIMIT, which hold the same value) from ../src/limits and ../src/other and ../src/same: when BATCH_SIZE changes, the test keeps checking the old value or stops testing the case it was written for. Use BATCH_SIZE (or an expression on it, such as BATCH_SIZE + 1). If the value is a contract the test pins on purpose, assert it next to the constant: expect(BATCH_SIZE).toBe(50).',
    );
  });

  it('does not report pins, trivial values, names, keys, types, paths or unseen constants', () => {
    const messages = reported(
      [
        "import { MAX_ITEMS, limit as cap } from '../src/limits';",
        "import * as limits from '../src/limits';",
        "import type { Role } from '../src/roles';",
        "import { HELPER_LIMIT } from './helpers/values';",
        "describe('eu-west-1', () => {",
        "  it('administrator', () => { expect(MAX_ITEMS).toBe(50); });",
        "  test('50', () => expect(limits.MAX_ITEMS).toEqual(50));",
        '  expect(retries()).toBe(2);',
        "  expect(code()).toBe('ab');",
        '  expect(depth()).toBe(9);',
        '  expect(hidden()).toBe(77);',
        '  expect(items()).toBe(3);',
        '  expect(helper()).toBe(123);',
        "  const options = { 'eu-west-1': true };",
        "  type Region = 'eu-west-1';",
        "  vi.mock('eu-west-1');",
        `  expect(cap()).toBe(\`\${MAX_ITEMS}\`);`,
        '});',
      ].join('\n'),
    );

    expect(messages).toEqual([]);
  });

  it('skips type-only imports and modules outside the project', () => {
    const messages = reported(
      [
        "import type { ROLE } from '../src/roles';",
        "import { readFileSync } from 'node:fs';",
        "expect(role()).toBe('administrator');",
      ].join('\n'),
    );

    expect(messages).toEqual([]);
  });

  it('does not read constants from test files and test helpers', () => {
    writeFileSync(path.join(root, 'src/limits.test.ts'), 'export const LOCAL_LIMIT = 321;');
    const messages = reported(
      "import './limits.test';\nimport '../test/helpers/values';\nexpect(a()).toBe(321);\nexpect(b()).toBe(123);",
      'src/other.test.ts',
    );

    expect(messages).toEqual([]);
  });

  it('follows require(), dynamic import(), import = require() and requireActual/importActual', () => {
    const messages = reported(
      [
        "const { limit } = require('../src/limits');",
        "import roles = require('../src/roles');",
        "it('loads late', async () => {",
        "  const { BATCH_SIZE: size } = await import('../src/same');",
        '  expect(limit()).toBe(-25);',
        "  expect(roles.role()).toBe('administrator');",
        '  expect(size).toBe(50);',
        '  expect(count()).toBe(50);',
        "  const other = await vi.importActual('../src/other');",
        "  const read = jest.requireActual('node:fs');",
        '  const dynamic = await import(`../src/${name}`);',
        '});',
      ].join('\n'),
    );

    expect(messages.map(({ line, message }) => `${line} ${message.split(':')[0]}`)).toEqual([
      '5 This literal copies MIN_BALANCE from ../src/limits',
      '6 This literal copies ROLE from ../src/roles',
      '8 This literal copies BATCH_SIZE (and MAX_ITEMS, OTHER_LIMIT, which hold the same value) from ../src/limits and ../src/other and ../src/same',
    ]);
  });

  it('reads static readonly members of exported classes', () => {
    const messages = reported(
      [
        "import { Paging as P, Shared } from '../src/paging';",
        'expect(pages()).toBe(40);',
        'expect(P.PAGE_LIMIT).toBe(40);',
        'expect(new P().size()).toBe(40);',
        "expect(key()).toBe('hidden-key');",
        'expect(other()).toEqual([41, 42, 43]);',
        "expect(Shared.name).toBe('local-key');",
      ].join('\n'),
    );

    expect(messages.map(({ line, message }) => `${line} ${message.split(' from ')[0]}`)).toEqual([
      '2 This literal copies Paging.PAGE_LIMIT',
      '4 This literal copies Paging.PAGE_LIMIT',
      '7 This literal copies Shared.LOCAL_KEY',
    ]);
  });

  it('works in JavaScript test files', () => {
    const messages = reported(
      "import { limit } from '../src/limits';\nexpect(limit()).toBe(50);",
      'test/limits.test.js',
    );

    expect(messages).toHaveLength(1);
  });
});
