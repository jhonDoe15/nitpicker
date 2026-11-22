import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './child-process-after-local-work.mts';

const tester = typescriptRuleTester();
const CP = "import { execFileSync, fork, spawn, spawnSync } from 'node:child_process';";
const EXECA = "import { execa } from 'execa';";

function invalid(code: string) {
  return { code, errors: [{ messageId: 'childProcessAfterLocalWork' }] };
}

tester.run('child-process-after-local-work', rule, {
  valid: [
    `${CP} export function check(root: string, files: string[]) { const typed = execFileSync('tsgo', [root]); const local = runLocal(files); return [...local, typed]; }`,
    `${CP} export function check(root: string) { const targets = findTargets(root); const typed = execFileSync('tsgo', targets); return { targets, typed }; }`,
    `${CP} export function check(root: string) { if (!root) { return []; } const typed = execFileSync('tsgo', [root]); return [typed]; }`,
    `${CP} export function check(root: string, files: string[]) { const local = runLocal(files); if (local.length > 0) { return local; } const typed = execFileSync('tsgo', [root]); return [...local, typed]; }`,
    `${CP} export function check(root: string) { const args = ['--project', root]; const configPath = path.join(root, 'tsconfig.json'); const typed = execFileSync('tsgo', args); return { configPath, typed }; }`,
    `${CP} export function check(root: string) { const first = execFileSync('tool-a', [root]); const second = execFileSync('tool-b', [root]); return [first, second]; }`,
    `${CP} function runA(root: string) { return spawnSync('a', [root]); } function runB(root: string) { return spawnSync('b', [root]); } export function check(root: string) { const first = runA(root); const second = runB(root); return [first, second]; }`,
    `${CP} export function check(root: string, files: string[]) { const local = runLocal(files); logLocal(local); const typed = execFileSync('tsgo', [root]); return typed; }`,
    `${CP} export const check = (root: string) => execFileSync('tsgo', [root]);`,
    {
      filename: 'src/check.test.mts',
      code: `${CP} export function check(root: string, files: string[]) { const local = runLocal(files); const typed = execFileSync('tsgo', [root]); return [...local, typed]; }`,
    },
    {
      filename: 'tests/check.ts',
      code: `${CP} export function check(root: string, files: string[]) { const local = runLocal(files); const typed = execFileSync('tsgo', [root]); return [...local, typed]; }`,
    },
  ],
  invalid: [
    invalid(
      `${CP} export function check(root: string, files: string[]) { const local = runLocalRules(files); const typed = execFileSync('tsgo', ['--project', root]); return [...local, typed]; }`,
    ),
    invalid(
      `${CP} export function check(root: string, files: string[]) { const local = files.map((file) => parseFile(file)); const typed = spawnSync('tsgo', [root]); return { local, typed }; }`,
    ),
    invalid(
      `${EXECA} export async function check(root: string, files: string[]) { const local = await runEslint(files); const typed = await execa('tsgo', [root]); return mergeResults(local, typed); }`,
    ),
    invalid(
      `${CP} function runTypecheck(root: string) { return execFileSync('tsgo', [root]); } export function check(root: string, files: string[]) { const local = runLocalRules(files); const typed = runTypecheck(root); return [...local, typed]; }`,
    ),
    invalid(
      `${CP} const invokeTsgo = (root: string) => spawnSync('tsgo', [root]); function runTypecheck(root: string) { return invokeTsgo(root); } export function check(root: string, files: string[]) { const local = runLocalRules(files); const typed = runTypecheck(root); return { local, typed }; }`,
    ),
    invalid(
      `${CP} export const check = (root: string, files: string[]) => { const local = runLocalRules(files); const typed = spawn('tsgo', [root]); return { local, typed }; };`,
    ),
    invalid(
      `${CP} export const check = function (root: string, files: string[]) { const local = runLocalRules(files); const typed = fork('worker.js', [root]); return { local, typed }; };`,
    ),
    invalid(
      `${CP} export function check(root: string, files: string[]) { const local: string[] = []; for (const file of files) { local.push(lintFile(file)); } const typed = execFileSync('tsgo', [root]); return [...local, typed]; }`,
    ),
    invalid(
      `${CP} export function check(root: string, files: string[]) { const local = runLocalRules(files); const args = ['--project', root]; const typed = execFileSync('tsgo', args); return [...local, typed]; }`,
    ),
  ],
});
