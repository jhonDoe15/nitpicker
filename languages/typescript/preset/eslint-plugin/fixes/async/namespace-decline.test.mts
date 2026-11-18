import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/async/no-sync-node-api-in-async.mts';
import { declines, FS } from './sync-fs-test-support.mts';

typescriptRuleTester().run('namespace fs declines', rule, {
  valid: [],
  invalid: [
    declines(
      `${FS}export async function dirs(root: string, ns: string[]) { return ns.filter((n) => fs.statSync(root + n).isDirectory()); }`,
    ),
    declines(
      `${FS}export async function s(p: string) { return fs.statSync(p, { throwIfNoEntry: false })?.size; }`,
    ),
    declines(
      `${FS}export async function s(p: string, o: object) { return fs.lstatSync(p, o).size; }`,
    ),
    declines(`${FS}export async function stdin() { return fs.readFileSync(0, 'utf8'); }`),
    declines(`${FS}export async function stdin() { return fs.readFileSync(process.stdin.fd); }`),
    declines(
      `${FS}export async function z(p: string) { const fd = fs.openSync(p, 'r'); try { return fs.readFileSync(fd); } finally { fs.closeSync(fd); } }`,
      3,
    ),
    declines(`${FS}export async function z(fd: number, d: string) { fs.writeFileSync(fd, d); }`),
    declines(
      `${FS}let cached: string | undefined;\nexport async function get(p: string) { if (cached === undefined) { cached = fs.readFileSync('a.txt', 'utf8'); } return cached; }`,
    ),
    declines(
      `${FS}let cached = '';\nexport async function get(p: string) { cached = fs.readFileSync('a.txt', 'utf8'); return cached; }`,
    ),
    declines(
      `${FS}export class A { cache?: string; async get(p: string) { if (!this.cache) { this.cache = fs.readFileSync('a.txt', 'utf8'); } return this.cache; } }`,
    ),
    declines(
      `${FS}const seen = new Map<string, string>();\nexport async function get(p: string) { return seen.has(p) ? seen.get(p) : fs.readFileSync('a.txt', 'utf8'); }`,
    ),
    declines(`${FS}process.on('exit', async () => { fs.writeFileSync('/tmp/x', 'done'); });`),
    declines(
      `${FS}async function bye() { fs.writeFileSync('/tmp/x', 'done'); }\nprocess.once('SIGINT', bye);`,
    ),
    declines(
      `${FS}window.addEventListener('beforeunload', async () => { fs.writeFileSync('/tmp/x', 'done'); });`,
    ),
    declines(`${FS}export async function c(p: string) { return fs.readFileSync(/* keep */ p); }`),
    declines(
      `${FS}export async function p(x = fs.readFileSync('/etc/hostname', 'utf8')) { return x; }`,
    ),
    declines(`${FS}export async function p(x: string) { return fs['readFileSync'](x); }`),
    declines(`${FS}export async function p(x: string) { return fs.realpathSync.native(x); }`),
    declines(`${FS}export async function p(x: string[]) { return fs.readFileSync(...x); }`),
    declines(`${FS}export async function p(x: string) { return fs.readFileSync?.(x); }`),
    declines(`${FS}export async function p(x: string) { return fs.readFileSync<string>(x); }`),
    declines(
      'import fs from "graceful-fs";\nexport async function p(x: string) { return fs.readFileSync(x); }',
    ),
    declines(
      'import fs from "node:fs";\nexport async function p(x: string) { fs = other; return fs.readFileSync(x); }',
    ),
    declines(
      `${FS}export async function p(x: string) { class A { v = fs.readFileSync(x); } return A; }`,
    ),
    declines(
      `${FS}export async function p(x: string) { class A { static { fs.readFileSync(x); } } return A; }`,
    ),
    declines(
      `${FS}export async function g(d: string) { const x = 1\n  fs.readdirSync(d).forEach(console.log) }`,
    ),
    declines(
      `import express from "express";\nimport fs from "node:fs";\nconst app = express();\napp.get("/", (req, res) => { res.send(fs.readFileSync("a")); });`,
    ),
  ],
});
