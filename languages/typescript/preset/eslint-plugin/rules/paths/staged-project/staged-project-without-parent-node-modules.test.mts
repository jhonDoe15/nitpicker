import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './staged-project-without-parent-node-modules.mts';

const tester = typescriptRuleTester();
const IMPORTS =
  "import { copyFileSync, cpSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';";

function invalid(code: string) {
  return { code, errors: [{ messageId: 'stagedProjectWithoutParentNodeModules' }] };
}

tester.run('staged-project-without-parent-node-modules', rule, {
  valid: [
    `${IMPORTS} export function stage(src: string) { const dir = mkdtempSync(path.join(tmpdir(), 'stage-')); for (const entry of readdirSync(src)) { symlinkSync(path.join(src, entry), path.join(dir, entry)); } symlinkSync(path.join(path.dirname(src), 'node_modules'), path.join(dir, 'node_modules')); writeFileSync(path.join(dir, 'tsconfig.json'), '{}'); return dir; }`,
    `${IMPORTS} export function stage(src: string) { const dir = mkdtempSync(path.join(tmpdir(), 'stage-')); for (const entry of readdirSync(src)) { symlinkSync(path.join(src, entry), path.join(dir, entry)); } execFileSync('tsc', ['--preserve-symlinks', '-p', dir]); }`,
    `${IMPORTS} export function stage(src: string) { const dir = mkdtempSync(path.join(tmpdir(), 'stage-')); for (const entry of readdirSync(src)) { cpSync(path.join(src, entry), path.join(dir, entry)); } execFileSync('node', ['run.js'], { cwd: dir, env: { ...process.env, NODE_PATH: '/repo/node_modules' } }); }`,
    `${IMPORTS} export function stage(src: string) { const dir = mkdtempSync(path.join(tmpdir(), 'stage-')); for (const entry of readdirSync(src)) { symlinkSync(path.join(src, entry), path.join(dir, entry)); } writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { typeRoots: ['/repo/node_modules/@types'] } })); }`,
    `${IMPORTS} export function stage(src: string) { const dir = mkdtempSync(path.join(tmpdir(), 'stage-')); for (const entry of readdirSync(src)) { copyFileSync(path.join(src, entry), path.join(dir, entry)); } return dir; }`,
    {
      filename: 'src/stage.test.mts',
      code: `${IMPORTS} export function stage(src: string) { const dir = mkdtempSync(path.join(tmpdir(), 'stage-')); for (const entry of readdirSync(src)) { symlinkSync(path.join(src, entry), path.join(dir, entry)); } writeFileSync(path.join(dir, 'tsconfig.json'), '{}'); }`,
    },
    {
      filename: 'tests/stage.ts',
      code: `${IMPORTS} export function stage(src: string) { const dir = mkdtempSync(path.join(tmpdir(), 'stage-')); for (const entry of readdirSync(src)) { symlinkSync(path.join(src, entry), path.join(dir, entry)); } execFileSync('tsc', ['-p', dir]); }`,
    },
  ],
  invalid: [
    invalid(
      `${IMPORTS} export function stage(src: string) { const dir = mkdtempSync(path.join(tmpdir(), 'stage-')); for (const entry of readdirSync(src)) { symlinkSync(path.join(src, entry), path.join(dir, entry)); } writeFileSync(path.join(dir, 'tsconfig.json'), '{}'); return dir; }`,
    ),
    invalid(
      `${IMPORTS} export function stage(src: string) { const dir = mkdtempSync(path.join(tmpdir(), 'stage-')); const entries = readdirSync(src); for (const entry of entries) { cpSync(path.join(src, entry), path.join(dir, entry)); } writeFileSync(path.join(dir, 'package.json'), '{}'); }`,
    ),
    invalid(
      `${IMPORTS} export function stage(src: string) { const dir = mkdtempSync(path.join(tmpdir(), 'stage-')); for (const entry of readdirSync(src)) { symlinkSync(path.join(src, entry), path.join(dir, entry)); } execFileSync('tsgo', ['--project', dir]); }`,
    ),
    invalid(
      `${IMPORTS} export function stage(src: string) { const dir = mkdtempSync(path.join(tmpdir(), 'stage-')); readdirSync(src).forEach((entry) => copyFileSync(path.join(src, entry), path.join(dir, entry))); execFileSync('eslint', ['.'], { cwd: dir }); }`,
    ),
    invalid(
      "import { mkdtemp, readdir, symlink, writeFile } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import path from 'node:path'; export async function stage(src: string) { const dir = await mkdtemp(path.join(tmpdir(), 'ts-')); for (const entry of await readdir(src)) { await symlink(path.join(src, entry), path.join(dir, entry)); } await writeFile(path.join(dir, 'tsconfig.check.json'), '{}'); }",
    ),
  ],
});
