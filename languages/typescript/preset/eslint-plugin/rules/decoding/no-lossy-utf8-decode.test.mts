import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-lossy-utf8-decode.mts';

const tester = typescriptRuleTester();

function flagged(code: string, messageId: 'decoder' | 'file') {
  return { code, errors: [{ messageId }] };
}

tester.run('no-lossy-utf8-decode', rule, {
  valid: [
    {
      code:
        'import { readFileSync, writeFileSync } from "node:fs"; export function f() { ' +
        'writeFileSync("package.json", readFileSync("package.json", "utf8").replace("a", "b")); }',
    },
    {
      code: 'export const v = JSON.parse(new TextDecoder().decode(base64url.decode(segment)));',
    },
    {
      code: 'const d = new TextDecoder("utf-8", { fatal: true }); export const v = JSON.parse(d.decode(bytes));',
    },
    {
      code: 'export const v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));',
    },
    { code: 'export const v = JSON.parse(new TextDecoder("utf-16le").decode(bytes));' },
    {
      code: 'export function f(bytes: Uint8Array) { console.log(new TextDecoder().decode(bytes)); }',
    },
    { code: 'export const ok = new TextDecoder().decode(bytes) === "ping";' },
    { code: 'export const text = new TextDecoder().decode(bytes);' },
    {
      code:
        'export function f(chunk: Uint8Array) { const d = new TextDecoder(); return JSON.parse(d.decode(chunk, { ' +
        'stream: true })); }',
    },
    {
      code:
        'import { readFile } from "node:fs/promises"; export async function f(p: string) { const t = await ' +
        'readFile(p, "utf8"); console.log(t); }',
    },
    {
      code:
        'import { readFile, writeFile } from "node:fs/promises"; export async function f(a: string, b: string) { ' +
        'const t = await readFile(a, "utf8"); await writeFile(b, t); }',
    },
    {
      code:
        'import { readFile, writeFile } from "node:fs/promises"; export async function f(p: string) { const t = ' +
        'await readFile(p); await writeFile(p, t); }',
    },
    {
      code: 'import fs from "node:fs"; export const cfg = JSON.parse(fs.readFileSync(path, "utf8"));',
    },
    { code: 'export const a = new TextDecoder(opts).decode(bytes) === other;' },
  ],
  invalid: [
    flagged('export const v = JSON.parse(new TextDecoder().decode(bytes));', 'decoder'),
    flagged(
      'const d = new TextDecoder("utf-8"); export const v = JSON.parse(d.decode(bytes));',
      'decoder',
    ),
    flagged(
      'const d = new TextDecoder("utf8", { fatal: false }); export const v = JSON.parse(d.decode(bytes));',
      'decoder',
    ),
    flagged(
      'export function f(a: Uint8Array, b: string) { const t = new TextDecoder().decode(a); return t === b; }',
      'decoder',
    ),
    flagged(
      'export function f(a: Uint8Array) { return createHash("sha1").update(new ' +
        'TextDecoder().decode(a)).digest("hex"); }',
      'decoder',
    ),
    flagged(
      'import { writeFileSync } from "node:fs"; export function f(a: Uint8Array) { writeFileSync(out, new ' +
        'TextDecoder().decode(a)); }',
      'decoder',
    ),
    flagged(
      'import fs from "node:fs/promises"; export async function f(file: string) { const content = await ' +
        'fs.readFile(file, "utf-8"); await fs.writeFile(file, transform(content)); }',
      'file',
    ),
    flagged(
      'import { readFileSync, writeFileSync } from "node:fs"; export function f(file: string) { const text = ' +
        'readFileSync(file, { encoding: "utf8" }); writeFileSync(file, text.replace("a", "b")); }',
      'file',
    ),
    flagged(
      'import { readFile, writeFile } from "node:fs/promises"; export async function f(p: string) { const buf = ' +
        'await readFile(p); const t = buf.toString("utf8"); await writeFile(p, `${t}\\n`); }',
      'file',
    ),
  ],
});
