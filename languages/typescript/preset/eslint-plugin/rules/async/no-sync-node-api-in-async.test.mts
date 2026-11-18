import type { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-sync-node-api-in-async.mts';
import { SYNC_FAMILIES, type SyncFamily } from './sync-node-apis.mts';

type CaseRow = [string, Exclude<RuleTester.InvalidTestCase['errors'], number>];

const tester = typescriptRuleTester();
const families: readonly SyncFamily[] = SYNC_FAMILIES;
const alternativeOf = (module: string, api: string) =>
  families.find((family) => family.modules.has(module))?.alternative(api);
const CALLBACK_ADVICE =
  'a loop in place of the synchronous callback (or `Promise.all` over `map` with an async callback), because `await` cannot go inside it, and then ';
const blocking = (api: string, module = 'fs', context = 'an async function', prefix = '') => [
  {
    messageId: 'blocking',
    data: { api, context, alternative: `${prefix}${alternativeOf(module, api)}` },
  },
];
const suggested = (api: string, output: string, messageId = 'awaitTwin') => [
  { ...blocking(api)[0], suggestions: [{ messageId, output }] },
];
const inCallback = (api: string) => blocking(api, 'fs', 'an async function', CALLBACK_ADVICE);
const EXPRESS = 'import express from "express"; import { readFileSync } from "node:fs";';
const WORKER = 'import { isMainThread } from "node:worker_threads";';
const FS = 'import { readFileSync, writeFileSync } from "node:fs";';

const blockers: CaseRow[] = [
  [
    `${FS} export async function load(path) { return readFileSync("a.txt", "utf8"); }`,
    suggested(
      'readFileSync',
      `${FS}\nimport { readFile } from "node:fs/promises"; export async function load(path) { return await readFile("a.txt", "utf8"); }`,
    ),
  ],
  [
    'import * as fs from "fs"; export const save = async (path, data) => { fs.writeFileSync("a.txt", data); };',
    suggested(
      'writeFileSync',
      'import * as fs from "fs"; export const save = async (path, data) => { await fs.promises.writeFile("a.txt", data); };',
    ),
  ],
  [
    'import fs from "node:fs"; export async function stat(path) { return fs.statSync(path); }',
    suggested(
      'statSync',
      'import fs from "node:fs"; export async function stat(path) { return await fs.promises.stat(path); }',
    ),
  ],
  [
    'import { readFileSync as read } from "node:fs"; export async function load(path) { return read("a.txt"); }',
    suggested(
      'readFileSync',
      'import { readFileSync as read } from "node:fs";\nimport { readFile } from "node:fs/promises"; export async function load(path) { return await readFile("a.txt"); }',
    ),
  ],
  [
    'const fs = require("fs"); exports.load = async function (path) { return fs.readFileSync("a.txt"); };',
    suggested(
      'readFileSync',
      'const fs = require("fs"); exports.load = async function (path) { return await fs.promises.readFile("a.txt"); };',
    ),
  ],
  [
    'const { readFileSync } = require("node:fs"); exports.load = async (path) => readFileSync(path);',
    blocking('readFileSync'),
  ],
  [
    'import fs from "fs"; const { readFileSync } = fs; export async function load(path) { return readFileSync(path); }',
    blocking('readFileSync'),
  ],
  [
    'import fs from "fs-extra"; export async function copy(a, b) { fs.copySync(a, b); }',
    blocking('copySync', 'fs-extra'),
  ],
  [
    'import { execSync } from "child_process"; export async function build() { return execSync("make"); }',
    blocking('execSync', 'child_process'),
  ],
  [
    'import cp from "node:child_process"; export async function build() { return cp.spawnSync("make"); }',
    blocking('spawnSync', 'child_process'),
  ],
  [
    'import crypto from "node:crypto"; export async function hash(p) { return crypto.pbkdf2Sync(p, "s", 600000, 32, "sha256"); }',
    blocking('pbkdf2Sync', 'crypto'),
  ],
  [
    'import { scryptSync } from "crypto"; export async function hash(p) { return scryptSync(p, "s", 64); }',
    blocking('scryptSync', 'crypto'),
  ],
  [
    'import zlib from "node:zlib"; export async function pack(b) { return zlib.gzipSync(b); }',
    blocking('gzipSync', 'zlib'),
  ],
  [
    'import { execaSync } from "execa"; export async function run() { return execaSync("ls"); }',
    blocking('execaSync', 'execa'),
  ],
  [
    `${FS} export async function load(files) { return files.map((file) => readFileSync(file, "utf8")); }`,
    inCallback('readFileSync'),
  ],
  [
    'import { existsSync } from "node:fs"; export async function pick(files) { return files.filter((file) => existsSync(file)); }',
    inCallback('existsSync'),
  ],
  [
    'import fs from "node:fs"; export async function pick(root, names) { return names.find((name) => fs.existsSync(root + name)); }',
    inCallback('existsSync'),
  ],
  [
    'import { readdirSync, statSync } from "node:fs"; export async function dirs(root) { return readdirSync(root).filter((name) => statSync(root + name).isDirectory()); }',
    [
      ...suggested(
        'readdirSync',
        'import { readdirSync, statSync } from "node:fs";\nimport { readdir } from "node:fs/promises"; export async function dirs(root) { return (await readdir(root)).filter((name) => statSync(root + name).isDirectory()); }',
      ),
      ...inCallback('statSync'),
    ],
  ],
  [
    'import fs from "node:fs"; export async function all(files) { return Promise.all(files.map(async (file) => fs.readFileSync("a.txt"))); }',
    suggested(
      'readFileSync',
      'import fs from "node:fs"; export async function all(files) { return Promise.all(files.map(async (file) => await fs.promises.readFile("a.txt"))); }',
    ),
  ],
  [
    'import fs from "node:fs"; export async function all(files) { return files.map((file) => { return fs.readFileSync(file); }); }',
    inCallback('readFileSync'),
  ],
  [
    `${FS} export class Store { async load(path) { return readFileSync("a.txt"); } }`,
    suggested(
      'readFileSync',
      `${FS}\nimport { readFile } from "node:fs/promises"; export class Store { async load(path) { return await readFile("a.txt"); } }`,
    ),
  ],
  [
    `${FS} async function main() { readFileSync("a"); } export function start() { return main(); }`,
    suggested(
      'readFileSync',
      `${FS}\nimport { readFile } from "node:fs/promises"; async function main() { await readFile("a"); } export function start() { return main(); }`,
    ),
  ],
  [
    `${FS} export async function main() { readFileSync("a"); } main();`,
    suggested(
      'readFileSync',
      `${FS}\nimport { readFile } from "node:fs/promises"; export async function main() { await readFile("a"); } main();`,
    ),
  ],
  [
    `${FS} export async function load(path) { const read = () => readFileSync(path); return await Promise.all([read(), writeFileSync("a.txt", "")]); }`,
    suggested(
      'writeFileSync',
      `${FS}\nimport { writeFile } from "node:fs/promises"; export async function load(path) { const read = () => readFileSync(path); return await Promise.all([read(), await writeFile("a.txt", "")]); }`,
    ),
  ],
  [
    'import express from "express"; import { readFileSync } from "node:fs"; const app = express(); app.get("/", (req, res) => { res.send(readFileSync("a")); });',
    blocking('readFileSync', 'fs', 'a request handler'),
  ],
  [
    'import express from "express"; import { readFileSync } from "node:fs"; const app = express(); function show(req, res) { res.send(readFileSync("a")); } app.post("/", show);',
    blocking('readFileSync', 'fs', 'a request handler'),
  ],
  [
    `${EXPRESS} const router = express.Router(); router.route("/").get((req, res) => { res.send(readFileSync("a")); });`,
    blocking('readFileSync', 'fs', 'a request handler'),
  ],
  [
    'import { Router } from "express"; import { readFileSync } from "node:fs"; const router = Router(); router.use((req, res) => res.send(readFileSync("a")));',
    blocking('readFileSync', 'fs', 'a request handler'),
  ],
  [
    'import type { Express } from "express"; import { readFileSync } from "node:fs"; export function mount(app: Express) { app.get("/", (req, res) => res.send(readFileSync("a"))); }',
    blocking('readFileSync', 'fs', 'a request handler'),
  ],
  [
    `${FS} export function start() { return (async () => readFileSync("a"))(); }`,
    suggested(
      'readFileSync',
      `${FS}\nimport { readFile } from "node:fs/promises"; export function start() { return (async () => await readFile("a"))(); }`,
    ),
  ],
  [
    'import fs from "node:fs"; export async function real(p) { return fs.realpathSync.native(p); }',
    blocking('realpathSync'),
  ],
  [
    'import fs from "node:fs"; export async function load(p) { return fs["readFileSync"](p); }',
    blocking('readFileSync'),
  ],
  [
    'import { existsSync } from "node:fs"; export async function has(p) { return existsSync(p); }',
    suggested(
      'existsSync',
      'import { existsSync } from "node:fs";\nimport { access } from "node:fs/promises"; export async function has(p) { return await access(p).then(() => true, () => false); }',
      'awaitAccess',
    ),
  ],
  [
    'import { closeSync } from "node:fs"; export async function close(fd) { closeSync(fd); }',
    blocking('closeSync'),
  ],
  [
    'import fs from "fs-extra"; export async function has(p) { return fs.pathExistsSync(p) || fs.existsSync(p); }',
    [...blocking('pathExistsSync', 'fs-extra'), ...blocking('existsSync', 'fs-extra')],
  ],
  [
    'import { hkdfSync } from "node:crypto"; export async function derive(k) { return hkdfSync("sha256", k, "", "", 32); }',
    blocking('hkdfSync', 'crypto'),
  ],
  [
    `${WORKER} ${FS} export async function run() { if (isMainThread) { readFileSync("a"); } }`,
    suggested(
      'readFileSync',
      `${WORKER} ${FS}\nimport { readFile } from "node:fs/promises"; export async function run() { if (isMainThread) { await readFile("a"); } }`,
    ),
  ],
  [
    'import { Controller, Get as Route } from "@nestjs/common"; import { readFileSync } from "node:fs"; @Controller() export class A { @Route() show() { return readFileSync("a"); } }',
    blocking('readFileSync', 'fs', 'a request handler'),
  ],
];

tester.run('no-sync-node-api-in-async', rule, {
  valid: [
    `${FS} export const load = (path) => readFileSync(path, "utf8");`,
    `${FS} const config = readFileSync("config.json", "utf8"); export async function handle() { return config; }`,
    'import { readFile } from "node:fs/promises"; export async function load(path) { return readFile(path, "utf8"); }',
    'import fs from "node:fs"; export async function load(path) { return fs.promises.readFile(path, "utf8"); }',
    'import { readFileSync } from "other-lib"; export async function load(path) { return readFileSync(path); }',
    'export async function load(path) { return readFileSync(path); }',
    `${FS} export async function load(path) { const read = () => readFileSync(path, "utf8"); return read; }`,
    `${FS} export async function load(path) { return () => readFileSync(path, "utf8"); }`,
    `${FS} async function main() { const text = readFileSync("a", "utf8"); console.log(text); } main().catch(console.error);`,
    `${FS} async function main() { await load(); } async function load() { readFileSync("a"); } void main();`,
    `${FS} const main = async () => { readFileSync("a"); }; await main();`,
    `#!/usr/bin/env node\n${FS} export async function run() { readFileSync("a"); }`,
    'import { parentPort } from "node:worker_threads"; import { pbkdf2Sync } from "node:crypto"; export async function hash(p) { return pbkdf2Sync(p, "s", 1, 32, "sha256"); } parentPort?.on("message", hash);',
    'import { execFile } from "node:child_process"; import { promisify } from "node:util"; export async function run() { return promisify(execFile)("ls"); }',
    'import express from "express"; const app = express(); app.get("/", (req, res) => { res.send(nothing()); });',
    'import { Controller, Get } from "@nestjs/common"; @Controller() export class A { @Post() save() { return 1; } }',
    `${FS} export async function load(files) { return files.map(async (file) => file); }`,
    `${FS} export async function load(emitter) { emitter.on("x", () => readFileSync("a")); }`,
    `${FS} (async () => { readFileSync("a"); })();`,
    `${FS} void (async function () { readFileSync("a"); })().catch(console.error);`,
    `${EXPRESS} const cache = new Map(); cache.get("k", () => readFileSync("a"));`,
    `${EXPRESS} export function mount(app) { app.get("/", (req, res) => res.send(readFileSync("a"))); }`,
    `${FS} export async function load(readFileSync) { return readFileSync("a"); }`,
    'import fs from "node:fs"; export async function load(fs) { return fs.readFileSync("a"); }',
    `${WORKER} ${FS} export async function run() { if (!isMainThread) { readFileSync("a"); } }`,
    `${WORKER} ${FS} export async function run() { if (isMainThread) { return 1; } else { readFileSync("a"); } }`,
  ],
  invalid: blockers.map(([code, errors]) => ({ code, errors })),
});

describe('the allowed form of each call', () => {
  it('names the promise counterpart, or access and stat for existsSync', () => {
    expect(alternativeOf('node:fs', 'readFileSync')).toBe(
      '`await readFile()` from "node:fs/promises"',
    );
    expect(alternativeOf('fs', 'existsSync')).toBe(
      '`access` or `stat` from "node:fs/promises" (`await access(path)` rejects when the path is missing)',
    );
    expect(alternativeOf('fs', 'closeSync')).toBe(
      'a `FileHandle` from `open()` of "node:fs/promises" (`await handle.read()`, `await handle.close()`)',
    );
    expect(alternativeOf('fs-extra', 'pathExistsSync')).toBe(
      '`await pathExists()` from "fs-extra"',
    );
    expect(alternativeOf('fs-extra', 'existsSync')).toBe('`await pathExists()` from "fs-extra"');
    const shell = alternativeOf('child_process', 'execSync');
    expect(shell).toContain(
      '`await promisify(exec)(command)` with `exec` from "node:child_process"',
    );
    expect(shell).toContain('keeps the shell');
    expect(shell).toContain('`&&`, pipes and globs would fail');
    expect(shell).toContain('`{ stdout, stderr }` strings instead of a Buffer');
    expect(shell).toContain('rejects with a different error shape');
    expect(shell).not.toContain('promisify(execFile)');
    for (const name of ['execFileSync', 'spawnSync']) {
      const file = alternativeOf('child_process', name);
      expect(file).toContain('`await promisify(execFile)(file, args)` with `execFile`');
      expect(file).toContain('without a shell');
      expect(file).toContain('`{ stdout, stderr }` strings instead of a Buffer');
      expect(file).not.toContain('promisify(exec)(command)');
    }
    expect(alternativeOf('crypto', 'scryptSync')).toBe(
      '`await promisify(scrypt)(...)` with `promisify` from "node:util"',
    );
    expect(alternativeOf('execa', 'execaCommandSync')).toBe('`await execaCommand()`');
  });
});
