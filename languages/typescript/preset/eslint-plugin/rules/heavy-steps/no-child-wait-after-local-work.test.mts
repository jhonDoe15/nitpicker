import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-child-wait-after-local-work.mts';

const tester = typescriptRuleTester();
const CP = "import { execa } from 'execa'; import { spawnSync } from 'node:child_process';";
const RUNNER =
  "async function runTypeChecker(options) { return execa('tsgo', ['--api', options.root]); }";

function invalid(code: string) {
  return { code: `${CP} ${RUNNER} ${code}`, errors: [{ messageId: 'childAfterLocalWork' }] };
}

tester.run('no-child-wait-after-local-work', rule, {
  valid: [
    `${CP} ${RUNNER} export async function run(o) { const typed = await runTypeChecker(o); const local = analyze(o); return [...local, ...typed]; }`,
    `${CP} ${RUNNER} export async function run(o) { const local = analyze(o); const typed = await runTypeChecker(local); return [...local, ...typed]; }`,
    `${CP} ${RUNNER} export async function run(o) { const local = analyze(o); const typed = await runTypeChecker(o); use(local); return typed; }`,
    `${CP} export async function run(o) { const local = analyze(o); const other = await fetchAll(o); return [...local, ...other]; }`,
    `${CP} ${RUNNER} export function f(root, live) { const scratch = path.dirname(root); const repo = runTypeChecker(live); return { scratch, repo }; }`,
    `${CP} ${RUNNER} export async function run(o) { const a = await runTypeChecker(o); const b = await runTypeChecker(o); return [...a, ...b]; }`,
    `${CP} ${RUNNER} export async function run(o) { const dir = path.join(o.root, 'x'); const typed = await runTypeChecker(o); return [dir, typed]; }`,
  ],
  invalid: [
    invalid(
      'export async function run(o) { const local = analyzeEverySourceFile(o); const typed = await runTypeChecker(o); return [...local, ...typed]; }',
    ),
    invalid(
      'export function run(o) { const local = analyze(o); const out = spawnSync("tsgolint", ["run"]); return [...local, ...out]; }',
    ),
    invalid(
      'export const run = async (o) => { const local = analyze(o); const typed = await execa("tsc", ["-p", o.root]); const all = [local, typed]; return all; };',
    ),
  ],
});
