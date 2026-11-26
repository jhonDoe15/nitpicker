import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-unbatched-heavy-run.mts';

const tester = typescriptRuleTester();
const CP =
  "import { spawn, spawnSync } from 'node:child_process'; import { readdirSync } from 'node:fs';";

function invalid(code: string) {
  return { code: `${CP} ${code}`, errors: [{ messageId: 'unbatchedRun' }] };
}

tester.run('no-unbatched-heavy-run', rule, {
  valid: [
    `${CP} export async function f(files) { for (const batch of batchesOf(files, 500)) await spawn(linter, ['--type-aware', ...batch]); }`,
    `${CP} export function f(files) { return spawn('prettier', ['--check', ...files]); }`,
    `${CP} export function f(files) { return spawn(linter, ['--type-aware', ...files.slice(0, 500)]); }`,
    `${CP} function run(batch) { return spawnSync('tsc', ['--noEmit', ...batch]); } export function f(files) { for (const b of chunks(files)) run(b); }`,
    `${CP} export const f = (groups) => Promise.all(groups.map((files) => spawn('tsgolint', ['--type-aware', ...files])));`,
    `${CP} const fixed = ['a.ts']; spawn('tsc', [...fixed]);`,
    `${CP} export function f(extraArgs) { return spawn('tsc', ['-p', '.', ...extraArgs]); }`,
  ],
  invalid: [
    invalid(
      "export async function f(allProjectFiles) { await spawn(linter, ['--type-aware', ...allProjectFiles]); }",
    ),
    invalid("export function f(files) { return spawnSync('tsc', ['--noEmit', ...files]); }"),
    invalid("spawnSync('node_modules/.bin/tsgolint', ['run', ...readdirSync('src')]);"),
  ],
});
