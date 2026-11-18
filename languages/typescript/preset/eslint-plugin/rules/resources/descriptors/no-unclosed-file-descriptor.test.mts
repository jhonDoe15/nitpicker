import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unclosed-file-descriptor.mts';

const tester = typescriptRuleTester();
const FS = "import fs from 'node:fs';";
const NAMED = "import { openSync, closeSync, writeSync } from 'fs';";
const PROMISES = "import { open } from 'node:fs/promises';";
const CP = "import { spawn } from 'node:child_process';";

function invalid(code: string, messageId: 'discarded' | 'neverClosed') {
  return { code, errors: [{ messageId }] };
}

tester.run('no-unclosed-file-descriptor', rule, {
  valid: [
    `${FS} export function run(file) { const fd = fs.openSync(file, 'a'); process.stdout.write = (chunk) => { fs.writeSync(fd, chunk); return true; }; }`,
    `${FS} export function run(file) { const fd = fs.openSync(file, 'a'); try { fs.writeSync(fd, 'x'); } finally { fs.closeSync(fd); } }`,
    `${NAMED} export function run(file) { const fd = openSync(file, 'a'); writeSync(fd, 'x'); closeSync(fd); }`,
    `${FS} ${CP} export function run(file) { const out = fs.openSync(file, 'a'); try { spawn('tool', [], { stdio: ['ignore', out, out] }); } finally { fs.closeSync(out); } }`,
    `${FS} export function run(file) { const fd = fs.openSync(file, 'r'); return fd; }`,
    `${FS} export function run(file) { const fd = fs.openSync(file, 'r'); return fs.createReadStream(null, { fd }); }`,
    `${FS} export function run(file) { const fd = fs.openSync(file, 'r'); this.fd = fd; }`,
    `${FS} export function run(file) { const fd = fs.openSync(file, 'r'); register(fd); }`,
    `${FS} export function run(file) { return fs.openSync(file, 'r'); }`,
    `${FS} const fd = fs.openSync('log.txt', 'a'); export const write = (text) => fs.writeSync(fd, text);`,
    `${PROMISES} export async function run(file) { const handle = await open(file); try { await handle.readFile(); } finally { await handle.close(); } }`,
    `${PROMISES} export async function run(file) { await using handle = await open(file); await handle.readFile(); }`,
    `${PROMISES} export async function run(file) { const handle = await open(file); return handle.createReadStream(); }`,
    `${PROMISES} export async function run(file) { const handle = await open(file); return handle; }`,
    "import { open } from 'other'; export async function run(file) { await open(file); }",
    "const fs = require('node:fs'); export function run(file) { const fd = fs.openSync(file, 'r'); fs.closeSync(fd); }",
    "import { openSync } from 'other-library'; export function run(file) { openSync(file, 'w'); }",
    "import fs from 'node:fs'; export function run(file) { fs.open(file, 'r', done); }",
    `${FS} export const run = (file) => { const fd = fs.openSync(file, 'r'); fs.closeSync(fd); };`,
  ],
  invalid: [
    invalid(`${FS} export function run(file) { fs.openSync(file, 'w'); }`, 'discarded'),
    invalid(`${NAMED} export function run(file) { openSync(file, 'w'); }`, 'discarded'),
    invalid(
      "import * as fs from 'node:fs'; export function run(dir) { fs.openSync(`${dir}/index.ts`, 'w'); }",
      'discarded',
    ),
    invalid(`${PROMISES} export async function run(file) { await open(file, 'w'); }`, 'discarded'),
    invalid(
      `${FS} export async function run(file) { await fs.promises.open(file, 'w'); }`,
      'discarded',
    ),
    invalid(
      `${FS} ${CP} export function run(file) { const out = fs.openSync(file, 'a'); spawn('tool', [], { stdio: ['ignore', out, out], detached: true }); }`,
      'neverClosed',
    ),
    invalid(
      `${FS} export function run(file) { const fd = fs.openSync(file, 'r'); const buffer = Buffer.alloc(4); fs.readSync(fd, buffer); return buffer; }`,
      'neverClosed',
    ),
    invalid(
      `${PROMISES} export async function run(file) { const handle = await open(file); return handle.readFile(); }`,
      'neverClosed',
    ),
    invalid(
      "import { promises as fsp } from 'node:fs'; export async function run(file) { const handle = await fsp.open(file); await handle.write('x'); }",
      'neverClosed',
    ),
    invalid(
      "const fs = require('node:fs'); module.exports = function run(file) { fs.openSync(file, 'w'); };",
      'discarded',
    ),
  ],
});
