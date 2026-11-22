import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './config-lookup-without-parent-walk.mts';

const tester = typescriptRuleTester();
const IMPORTS =
  "import { existsSync, readFileSync, statSync } from 'node:fs'; import path from 'node:path';";

function invalid(code: string, config: string) {
  return { code, errors: [{ messageId: 'configLookupWithoutParentWalk', data: { config } }] };
}

tester.run('config-lookup-without-parent-walk', rule, {
  valid: [
    `${IMPORTS} export function load(dir: string) { let cur = dir; while (true) { const p = path.join(cur, 'tsconfig.json'); if (existsSync(p)) { return p; } const next = path.dirname(cur); if (next === cur) { return DEFAULT_TSCONFIG; } cur = next; } }`,
    `${IMPORTS} export function load(dir: string): string { const p = path.join(dir, 'tsconfig.json'); if (existsSync(p)) { return p; } const parent = path.dirname(dir); return parent === dir ? DEFAULT_TSCONFIG : load(parent); }`,
    `${IMPORTS} export function load(dir: string) { return findUp('tsconfig.json', dir) ?? DEFAULT_TSCONFIG; }`,
    `${IMPORTS} export function load(dir: string) { const p = path.join(dir, 'package.json'); return existsSync(p) ? p : DEFAULT_PKG; }`,
    `${IMPORTS} export function load(dir: string) { const p = path.join(dir, '.git'); return existsSync(p) ? p : DEFAULT_ROOT; }`,
    `${IMPORTS} export function load(dir: string) { const p = path.join(dir, 'package-lock.json'); return existsSync(p) ? p : DEFAULT_LOCK; }`,
    `${IMPORTS} export function load(dir: string) { const p = path.join(dir, 'tsconfig.json'); if (!existsSync(p)) { throw new Error('missing'); } return p; }`,
    `${IMPORTS} export function load(dir: string) { const p = path.join(dir, 'tsconfig.json'); return existsSync(p) ? p : undefined; }`,
    {
      filename: 'src/config.test.mts',
      code: `${IMPORTS} export function load(dir: string) { const p = path.join(dir, 'tsconfig.json'); return existsSync(p) ? p : DEFAULT_TSCONFIG; }`,
    },
    {
      filename: 'tests/config.ts',
      code: `${IMPORTS} export function load(dir: string) { const p = path.join(dir, 'tsconfig.json'); return existsSync(p) ? p : DEFAULT_TSCONFIG; }`,
    },
  ],
  invalid: [
    invalid(
      `${IMPORTS} export function load(dir: string) { const p = path.join(dir, 'tsconfig.json'); return existsSync(p) ? p : DEFAULT_TSCONFIG; }`,
      'tsconfig.json',
    ),
    invalid(
      `${IMPORTS} export function load(dir: string) { const p = path.resolve(dir, 'eslint.config.mjs'); if (existsSync(p)) { return p; } return SHIPPED_ESLINT; }`,
      'eslint.config.mjs',
    ),
    invalid(
      `${IMPORTS} export function load(dir: string) { const p = path.join(dir, '.prettierrc.json'); if (!existsSync(p)) { return DEFAULT_PRETTIER; } return p; }`,
      '.prettierrc.json',
    ),
    invalid(
      `${IMPORTS} export function load(dir: string) { try { return readFileSync(path.join(dir, 'pyproject.toml'), 'utf8'); } catch { return DEFAULT_PYPROJECT; } }`,
      'pyproject.toml',
    ),
    invalid(
      `${IMPORTS} export function load(dir: string) { try { statSync(path.join(dir, '.editorconfig')); return path.join(dir, '.editorconfig'); } catch { return DEFAULT_EDITORCONFIG; } }`,
      '.editorconfig',
    ),
    invalid(
      "import { readFile } from 'node:fs/promises'; import path from 'node:path'; export async function load(dir: string) { return await readFile(path.join(dir, 'babel.config.json'), 'utf8').catch(() => DEFAULT_BABEL); }",
      'babel.config.json',
    ),
    invalid(
      `${IMPORTS} export function load(dir: string) { const p = path.join(dir, 'jsconfig.json'); return readFileSync(p, 'utf8') || DEFAULT_JSCONFIG; }`,
      'jsconfig.json',
    ),
  ],
});
