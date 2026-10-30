import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-falsy-default.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-falsy-default-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      allowJs: true,
      checkJs: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2022'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

function typed(code, name, extension = 'ts') {
  const file = path.join(root, `src/case-${randomUUID()}.${extension}`);
  writeFileSync(file, code);
  return {
    filename: file,
    code,
    ...(name === undefined ? {} : { errors: [{ messageId: 'falsyDefault', data: { name } }] }),
  };
}

tester.run('no-falsy-default', rule, {
  valid: [
    'export function pick(limit?: number) { return limit ?? 10; }',
    'export function pick(limit = 10) { return limit || 20; }',
    'export function pick(limit: number) { return limit || 20; }',
    "export function pick(name?: string) { return name || ''; }",
    'export function pick(count?: number) { return count || 0; }',
    'export function pick(flag?: boolean) { return flag || false; }',
    "export function pick(kind?: 'a' | 'b') { return kind || 'a'; }",
    'export function pick(user?: { id: string }) { return user || { id: "none" }; }',
    'export function pick(items?: string[]) { return items || []; }',
    'export function pick(limit?: number) { if (limit || fallback()) { return 1; } return 2; }\ndeclare function fallback(): boolean;',
    'export function pick(limit?: number) { return !limit; }',
    'export function pick(limit?: number) { return Boolean(limit || 0); }',
    'export function pick(limit?: number) { return limit !== undefined ? limit : 10; }',
    'export function pick(limit?: number) { if (limit === undefined) { return 1; } return limit || 5; }',
    'export function run(input: string | undefined) { const value = input || undefined; return value; }',
    'export function pick(limit?: number, other?: number) { return limit && other ? limit : 10; }',
    'export function pick() { const limit: number | undefined = Math.random() > 1 ? 1 : undefined; return limit || 10; }',
    typed(
      '/** @param {number} [limit] */\nexport function pick(limit) { return limit ?? 10; }',
      undefined,
      'js',
    ),
    typed('export function pick(limit) { return limit || 10; }', undefined, 'js'),
  ].map((code) => (typeof code === 'string' ? typed(code) : code)),
  invalid: [
    typed('export function pick(limit?: number) { return limit || 10; }', 'limit'),
    typed('export function pick(name: string | undefined) { return name || "none"; }', 'name'),
    typed('export function pick(limit: number | null) { return limit || 10; }', 'limit'),
    typed('export function pick(flag?: boolean) { return flag || true; }', 'flag'),
    typed('export function pick(count?: number) { return count || ""; }', 'count'),
    typed('export function pick(limit?: number) { return limit ? limit : 10; }', 'limit'),
    typed('export const pick = (limit?: number) => limit || 10;', 'limit'),
    typed(
      'export function pick(limit?: number) { const value = limit || 10; return value; }',
      'limit',
    ),
    typed(
      'export function pick(limit?: number) { return fetchLimit(limit || 10); }\ndeclare function fetchLimit(value: number): number;',
      'limit',
    ),
    typed(
      '/** @param {number} [limit] */\nexport function pick(limit) { return limit || 10; }',
      'limit',
      'js',
    ),
    typed(
      '/** @param {string|undefined} name */\nexport function pick(name) { return name || "none"; }',
      'name',
      'js',
    ),
  ],
});
