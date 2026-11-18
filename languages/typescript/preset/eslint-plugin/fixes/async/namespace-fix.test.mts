import { typescriptRuleTester, configuredRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/async/no-sync-node-api-in-async.mts';
import tseslint from 'typescript-eslint';
import { declines, fixes, FS } from './sync-fs-test-support.mts';

typescriptRuleTester().run('namespace fs fixes', rule, {
  valid: [],
  invalid: [
    fixes(
      `${FS}export async function load(p: string) { const text = fs.readFileSync('a.txt', 'utf8'); return text.length; }`,
      `${FS}export async function load(p: string) { const text = await fs.promises.readFile('a.txt', 'utf8'); return text.length; }`,
    ),
    fixes(
      `${FS}export async function a(d: string) { return fs.readdirSync(d).filter((n) => n.endsWith('.ts')); }`,
      `${FS}export async function a(d: string) { return (await fs.promises.readdir(d)).filter((n) => n.endsWith('.ts')); }`,
    ),
    fixes(
      `import * as fs from 'fs';\nexport async function a(d: string) { fs.mkdirSync(d, { recursive: true }); }`,
      `import * as fs from 'fs';\nexport async function a(d: string) { await fs.promises.mkdir(d, { recursive: true }); }`,
    ),
    fixes(
      `const fs = require('node:fs');\nexports.save = async (p, s) => { fs.writeFileSync('a.txt', s); };`,
      `const fs = require('node:fs');\nexports.save = async (p, s) => { await fs.promises.writeFile('a.txt', s); };`,
    ),
    fixes(
      `${FS}export async function safe(p: string) { try { return fs.readFileSync('a.txt'); } catch { return undefined; } }`,
      `${FS}export async function safe(p: string) { try { return await fs.promises.readFile('a.txt'); } catch { return undefined; } }`,
    ),
    fixes(
      `${FS}export async function all(ps: string[]) { for (const p of ps) { fs.unlinkSync(p); } }`,
      `${FS}export async function all(ps: string[]) { for (const p of ps) { await fs.promises.unlink(p); } }`,
    ),
    fixes(
      `${FS}export async function g(d: string) { return fs.readdirSync(d)?.length; }`,
      `${FS}export async function g(d: string) { return (await fs.promises.readdir(d))?.length; }`,
    ),
    fixes(
      `${FS}export async function g(d: string) { return fs.statSync(d).isDirectory(); }`,
      `${FS}export async function g(d: string) { return (await fs.promises.stat(d)).isDirectory(); }`,
    ),
    fixes(
      `${FS}export async function g(d: string) { return fs.readFileSync('a.txt', 'utf8') as string; }`,
      `${FS}export async function g(d: string) { return (await fs.promises.readFile('a.txt', 'utf8')) as string; }`,
    ),
    fixes(
      `${FS}export async function g(d: string) { return fs.readFileSync('a.txt', 'utf8')!; }`,
      `${FS}export async function g(d: string) { return (await fs.promises.readFile('a.txt', 'utf8'))!; }`,
    ),
    fixes(
      `${FS}export async function g(d: string) { return typeof fs.readFileSync('a.txt'); }`,
      `${FS}export async function g(d: string) { return typeof (await fs.promises.readFile('a.txt')); }`,
    ),
    fixes(
      `${FS}export async function g(d: string) { return fs.readdirSync(d).length ** 2; }`,
      `${FS}export async function g(d: string) { return (await fs.promises.readdir(d)).length ** 2; }`,
    ),
    fixes(
      `${FS}export async function g(d: string) { return \`\${fs.readFileSync('a.txt', 'utf8')}!\`; }`,
      `${FS}export async function g(d: string) { return \`\${await fs.promises.readFile('a.txt', 'utf8')}!\`; }`,
    ),
    fixes(
      `${FS}export async function g(d: string) { return await fs.readFileSync('a.txt'); }`,
      `${FS}export async function g(d: string) { return await fs.promises.readFile('a.txt'); }`,
    ),
    fixes(
      `${FS}export const g = async (d: string) => fs.readFileSync('a.txt', { encoding: 'utf8', flag: 'r' });`,
      `${FS}export const g = async (d: string) => await fs.promises.readFile('a.txt', { encoding: 'utf8', flag: 'r' });`,
    ),
    fixes(
      `${FS}export class A { async run(d: string) { return JSON.parse(fs.readFileSync('a.txt', 'utf8')); } }`,
      `${FS}export class A { async run(d: string) { return JSON.parse(await fs.promises.readFile('a.txt', 'utf8')); } }`,
    ),
    fixes(
      `${FS}export async function g(d: string) { fs.readdirSync(d).forEach(console.log); }`,
      `${FS}export async function g(d: string) { (await fs.promises.readdir(d)).forEach(console.log); }`,
    ),
    fixes(
      `${FS}export async function g(d: string) { const x = 1;\n  fs.readdirSync(d).forEach(console.log); }`,
      `${FS}export async function g(d: string) { const x = 1;\n  (await fs.promises.readdir(d)).forEach(console.log); }`,
    ),
    fixes(
      `${FS}export async function g(a: string, b: string) { fs.renameSync(a, b); return 1; }`,
      `${FS}export async function g(a: string, b: string) { await fs.promises.rename(a, b); return 1; }`,
    ),
  ],
});
