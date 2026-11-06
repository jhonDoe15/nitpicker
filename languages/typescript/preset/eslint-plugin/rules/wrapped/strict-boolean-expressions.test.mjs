import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { truthinessRuleOptions } from '../../../eslint-config/truthiness/truthiness-rules.mjs';
import { rule } from './strict-boolean-expressions.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-truthiness-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      noUncheckedIndexedAccess: true,
      allowJs: true,
      checkJs: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2023'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const linter = new Linter({ cwd: root });
const config = [
  {
    files: ['**/*.{ts,js}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: root },
    },
    plugins: { nitpicker: { rules: { 'strict-boolean-expressions': rule } } },
    rules: { 'nitpicker/strict-boolean-expressions': ['error', truthinessRuleOptions] },
  },
];

function typed(code, messageId, extension = 'ts') {
  const filename = path.join(root, `src/case-${randomUUID()}.${extension}`);
  writeFileSync(filename, code);
  return { filename, code, expected: messageId === undefined ? [] : [messageId] };
}

function reportedIds({ filename, code }) {
  return linter
    .verify(code, config, { filename })
    .map((message) => message.messageId ?? message.message);
}

const NUMBER = 'conditionErrorNumber';
const NULLABLE = 'conditionErrorNullableNumber';
const OTHER = 'conditionErrorOther';

const allowed = [
  'export function run(id?: number) { if (id !== undefined) { return id; } return -1; }',
  'export function run(count: number) { return count > 0 ? "some" : "none"; }',
  'export function run(items: string[]) { return items.length > 0; }',
  'export function run(items: string[], item: string) { return items.indexOf(item) !== -1; }',
  'export function run(name: string) { return name ? name : "none"; }',
  'export function run(name?: string) { if (!name) { return "none"; } return name; }',
  'export function run(user?: { id: number }) { return user ? user.id : -1; }',
  'export function run(flag?: boolean) { return flag ? 1 : 2; }',
  'export function run(count?: number) { return count ?? 10; }',
  'export function run(count?: number) { return count || 0; }',
  'export function run(text: string) { return Number.parseInt(text, 10) || 0; }',
  'export function run(a?: number, b?: number) { return a || b || 0; }',
  'export function sort(rows: { a: number; b: string }[]) { return rows.toSorted((x, y) => x.a - y.a || x.b.localeCompare(y.b)); }',
  'export function sort(rows: string[]) { return rows.toSorted((x, y) => x.localeCompare(y) || x.length - y.length); }',
  'export function sort(x: number, y: number) { return compareBy(x, y) || x - y; }\ndeclare function compareBy(x: number, y: number): number;',
  'export function has(flags: number, mask: number) { return flags & mask ? "set" : "clear"; }',
  'export function find(masks: number[], flags: number) { return masks.find((mask) => flags & mask); }',
  'export function keep(items: unknown[], test: any) { return items.filter(test); }',
  'export function run(value: unknown) { return value ? 1 : 2; }',
  'export function run(a: number | undefined, b: boolean) { return (b && a) || 0; }',
  'export function run(user: { id: number }) { if (user) { return 1; } return 2; }',
  'export function run(none: undefined) { return none ? 1 : 2; }',
  typed('export function run(count) { return count ? 1 : 2; }', undefined, 'js'),
].map((code) => (typeof code === 'string' ? typed(code) : code));

const banned = [
  typed('export function run(count: number) { if (count) { return 1; } return 2; }', NUMBER),
  typed('export function run(retry: number) { return retry ? `retry: ${retry}` : ""; }', NUMBER),
  typed(
    'export function run(value: number) { if (!value) { return "missing"; } return "ok"; }',
    NUMBER,
  ),
  typed(
    'export function run(items: string[], item: string) { const index = items.indexOf(item); if (index) { return index; } return -1; }',
    NUMBER,
  ),
  typed(
    'export function run(id?: number) { if (!id) { return "new"; } return "saved"; }',
    NULLABLE,
  ),
  typed(
    'export function run(message: { id?: number }) { return message.id ? "a" : "b"; }',
    NULLABLE,
  ),
  typed(
    'export function run(items: string[]) { if (items.length) { return 1; } return 2; }',
    NUMBER,
  ),
  typed('export function run(cells: number[]) { return cells[0] || ""; }', NULLABLE),
  typed('export function run(count: number) { return count || 10; }', NUMBER),
  typed('export function run(value: string | number) { return value ? 1 : 2; }', OTHER),
  typed('export function run(rows: number[]) { return rows.filter((row) => row); }', NUMBER),
  typed('export function run(start: number, end: number) { return end - start ? 1 : 2; }', NUMBER),
  typed('export function run(rows: number[]) { return rows.filter((row) => row - 1); }', NUMBER),
  typed('export function run(start: number, end: number) { return end - start || 1; }', NUMBER),
  typed(
    'export function run(a: number) { return compareTo(a) ? 1 : 2; }\ndeclare function compareTo(a: number): number;',
    NUMBER,
  ),
  typed(
    '/** @param {number} count */\nexport function run(count) { return count ? 1 : 2; }',
    NUMBER,
    'js',
  ),
];

describe('nitpicker/strict-boolean-expressions', () => {
  it.each(allowed.map((fixture) => [fixture.code, fixture]))('allows %s', (_code, fixture) => {
    expect(reportedIds(fixture)).toEqual([]);
  });

  it.each(banned.map((fixture) => [fixture.code, fixture]))('reports %s', (_code, fixture) => {
    expect(reportedIds(fixture)).toEqual(fixture.expected);
  });
});

describe('nitpicker/strict-boolean-expressions messages', () => {
  const nullable = typed('export function run(id?: number) { return id ? 1 : 2; }');
  const number = typed('export function run(count: number) { return count ? 1 : 2; }');

  it('names the allowed forms', () => {
    const [nullableMessage] = linter.verify(nullable.code, config, nullable);
    const [numberMessage] = linter.verify(number.code, config, number);
    expect(nullableMessage?.message).toBe(
      'Unexpected nullable number value in conditional: 0 reads as missing. Test the missing case and the number apart: `value !== undefined`, `value !== undefined && value > 0`, or `value ?? fallback` for a default. An exception fits only when 0 must take the same path as a missing value.',
    );
    expect(numberMessage?.message).toBe(
      'Unexpected number value in conditional: 0 and NaN read as false. Compare it instead: `count > 0`, `index !== -1`, `items.length > 0`; for a default write `value ?? fallback`. An exception fits only when 0 must take the same path as a missing value.',
    );
  });
});
