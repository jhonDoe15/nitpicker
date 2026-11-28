import type { TSESLint } from '@typescript-eslint/utils';
import { describe, expect, it } from 'vitest';
import { referencesOf } from '../analysis/constant-resolution.mts';
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
    `${CP} ${RUNNER} export const run = async (o) => runTypeChecker(o);`,
    `${CP} ${RUNNER} export async function run(o) { const typed = await runTypeChecker(o); const local = analyze(o); return [...local, ...typed]; }`,
    `${CP} ${RUNNER} export async function run(o) { const local = analyze(o); const typed = await runTypeChecker(local); return [...local, ...typed]; }`,
    `${CP} ${RUNNER} export async function run(o) { const local = analyze(o); const typed = await runTypeChecker(o); use(local); return typed; }`,
    `${CP} export async function run(o) { const local = analyze(o); const other = await fetchAll(o); return [...local, ...other]; }`,
    `${CP} ${RUNNER} export function f(root, live) { const scratch = path.dirname(root); const repo = runTypeChecker(live); return { scratch, repo }; }`,
    `${CP} ${RUNNER} export async function run(o) { const a = await runTypeChecker(o); const b = await runTypeChecker(o); return [...a, ...b]; }`,
    `${CP} ${RUNNER} export async function run(o) { const dir = path.join(o.root, 'x'); const typed = await runTypeChecker(o); return [dir, typed]; }`,
    `${CP} export function run(o) { let local; const out = spawnSync("tsgo", ["run"]); return [local, out]; }`,
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

describe('referencesOf', () => {
  const found: number[] = [];
  const probe: TSESLint.RuleModule<'none'> = {
    meta: { type: 'problem', schema: [], messages: { none: 'none' } },
    defaultOptions: [],
    create: (context) => ({
      CallExpression: (node) => {
        const { sourceCode } = context;
        found.push(
          referencesOf({ sourceCode }, node, 'known').length,
          referencesOf({ sourceCode }, node, 'ghost').length,
        );
      },
    }),
  };

  tester.run('referencesOf probe', probe, {
    valid: ['var known = 1; use(known, known);'],
    invalid: [],
  });

  it('lists the references of a declared name and none for an undeclared one', () => {
    expect(found).toEqual([3, 0]);
  });
});
