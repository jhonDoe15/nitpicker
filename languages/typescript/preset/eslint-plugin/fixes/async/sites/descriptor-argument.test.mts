import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../../../rules/async/no-sync-node-api-in-async.mts';
import { declines, fixes, FS } from '../test-support/sync-fs-cases.mts';

const PATH = "import path from 'node:path';\n";

typescriptRuleTester().run('descriptor arguments without types', rule, {
  valid: [],
  invalid: [
    declines(
      `${FS}const out = process.stdout.fd;\nexport async function g() { fs.writeFileSync(out, 'x'); }`,
    ),
    declines(`${FS}export async function g(h: any) { return fs.readFileSync(h); }`),
    declines(`${FS}export async function g(h: string) { return fs.readFileSync(h); }`),
    declines(`${FS}export async function g(o: { p: string }) { return fs.readFileSync(o.p); }`),
    declines(`${FS}export async function g(h: string) { return fs.appendFileSync(h, 'x'); }`),
    declines(`${FS}export async function g() { return fs.readFileSync(join('a', 'b')); }`),
    declines(
      `${FS}import { join } from './own.mts';\nexport async function g() { return fs.readFileSync(join('a', 'b')); }`,
    ),
    declines(
      `${FS}const path = { join: (a: string) => 3 };\nexport async function g() { return fs.readFileSync(path.join('a')); }`,
    ),
    fixes(
      `${FS}export async function g() { return fs.readFileSync('a.txt'); }`,
      `${FS}export async function g() { return await fs.promises.readFile('a.txt'); }`,
    ),
    fixes(
      `${FS}export async function g(n: string) { return fs.readFileSync(\`\${n}.txt\`); }`,
      `${FS}export async function g(n: string) { return await fs.promises.readFile(\`\${n}.txt\`); }`,
    ),
    fixes(
      `${FS}${PATH}export async function g(n: string) { return fs.readFileSync(path.join(n, 'a')); }`,
      `${FS}${PATH}export async function g(n: string) { return await fs.promises.readFile(path.join(n, 'a')); }`,
    ),
    fixes(
      `${FS}import { resolve } from 'path';\nexport async function g(n: string) { fs.writeFileSync(resolve(n), 'x'); }`,
      `${FS}import { resolve } from 'path';\nexport async function g(n: string) { await fs.promises.writeFile(resolve(n), 'x'); }`,
    ),
    fixes(
      `${FS}export async function g(u: string) { return fs.readFileSync(new URL(u)); }`,
      `${FS}export async function g(u: string) { return await fs.promises.readFile(new URL(u)); }`,
    ),
  ],
});
