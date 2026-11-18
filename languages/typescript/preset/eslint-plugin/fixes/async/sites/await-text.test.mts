import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../../../rules/async/no-sync-node-api-in-async.mts';
import { declines, fixes, FS } from '../sync-fs-test-support.mts';

typescriptRuleTester().run('no-semicolon statements after a function body', rule, {
  valid: [],
  invalid: [
    declines(
      `${FS}export async function g() {\n  const f = () => {}\n  fs.readdirSync('.').forEach(f)\n}`,
    ),
    declines(
      `${FS}export async function g() {\n  const f = function () {}\n  fs.readdirSync('.').forEach(f)\n}`,
    ),
    declines(
      `${FS}export async function g() {\n  let x\n  x = function () {}\n  fs.readdirSync('.').forEach(x)\n}`,
    ),
    declines(
      `${FS}export async function g() {\n  const C = class {}\n  fs.readdirSync('.').forEach(C)\n}`,
    ),
    fixes(
      `${FS}export async function g(f: () => void) {\n  if (f) {}\n  fs.readdirSync('.').forEach(f)\n}`,
      `${FS}export async function g(f: () => void) {\n  if (f) {}\n  (await fs.promises.readdir('.')).forEach(f)\n}`,
    ),
    fixes(
      `${FS}export async function g(f: () => void) {\n  function inner() {}\n  fs.readdirSync('.').forEach(f)\n}`,
      `${FS}export async function g(f: () => void) {\n  function inner() {}\n  (await fs.promises.readdir('.')).forEach(f)\n}`,
    ),
  ],
});
