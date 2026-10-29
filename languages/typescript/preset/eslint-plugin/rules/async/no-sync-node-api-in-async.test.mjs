import { describe, expect, it } from 'vitest';
import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule } from './no-sync-node-api-in-async.mjs';
import { SYNC_FAMILIES } from './sync-node-apis.mjs';

const tester = createRuleTester();
const alternativeOf = (module, api) =>
  SYNC_FAMILIES.find((family) => family.modules.has(module)).alternative(api);
const blocking = (api, module = 'fs', context = 'an async function') => [
  { messageId: 'blocking', data: { api, context, alternative: alternativeOf(module, api) } },
];
const EXPRESS = 'import express from "express"; import { readFileSync } from "node:fs";';
const WORKER = 'import { isMainThread } from "node:worker_threads";';
const FS = 'import { readFileSync, writeFileSync } from "node:fs";';

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
  invalid: [
    {
      code: `${FS} export async function load(path) { return readFileSync(path, "utf8"); }`,
      errors: blocking('readFileSync'),
    },
    {
      code: 'import * as fs from "fs"; export const save = async (path, data) => { fs.writeFileSync(path, data); };',
      errors: blocking('writeFileSync'),
    },
    {
      code: 'import fs from "node:fs"; export async function stat(path) { return fs.statSync(path); }',
      errors: blocking('statSync'),
    },
    {
      code: 'import { readFileSync as read } from "node:fs"; export async function load(path) { return read(path); }',
      errors: blocking('readFileSync'),
    },
    {
      code: 'const fs = require("fs"); exports.load = async function (path) { return fs.readFileSync(path); };',
      errors: blocking('readFileSync'),
    },
    {
      code: 'const { readFileSync } = require("node:fs"); exports.load = async (path) => readFileSync(path);',
      errors: blocking('readFileSync'),
    },
    {
      code: 'import fs from "fs"; const { readFileSync } = fs; export async function load(path) { return readFileSync(path); }',
      errors: blocking('readFileSync'),
    },
    {
      code: 'import fs from "fs-extra"; export async function copy(a, b) { fs.copySync(a, b); }',
      errors: blocking('copySync', 'fs-extra'),
    },
    {
      code: 'import { execSync } from "child_process"; export async function build() { return execSync("make"); }',
      errors: blocking('execSync', 'child_process'),
    },
    {
      code: 'import cp from "node:child_process"; export async function build() { return cp.spawnSync("make"); }',
      errors: blocking('spawnSync', 'child_process'),
    },
    {
      code: 'import crypto from "node:crypto"; export async function hash(p) { return crypto.pbkdf2Sync(p, "s", 600000, 32, "sha256"); }',
      errors: blocking('pbkdf2Sync', 'crypto'),
    },
    {
      code: 'import { scryptSync } from "crypto"; export async function hash(p) { return scryptSync(p, "s", 64); }',
      errors: blocking('scryptSync', 'crypto'),
    },
    {
      code: 'import zlib from "node:zlib"; export async function pack(b) { return zlib.gzipSync(b); }',
      errors: blocking('gzipSync', 'zlib'),
    },
    {
      code: 'import { execaSync } from "execa"; export async function run() { return execaSync("ls"); }',
      errors: blocking('execaSync', 'execa'),
    },
    {
      code: `${FS} export async function load(files) { return files.map((file) => readFileSync(file, "utf8")); }`,
      errors: blocking('readFileSync'),
    },
    {
      code: `${FS} export class Store { async load(path) { return readFileSync(path); } }`,
      errors: blocking('readFileSync'),
    },
    {
      code: `${FS} async function main() { readFileSync("a"); } export function start() { return main(); }`,
      errors: blocking('readFileSync'),
    },
    {
      code: `${FS} export async function main() { readFileSync("a"); } main();`,
      errors: blocking('readFileSync'),
    },
    {
      code: `${FS} export async function load(path) { const read = () => readFileSync(path); return await Promise.all([read(), writeFileSync(path, "")]); }`,
      errors: blocking('writeFileSync'),
    },
    {
      code: 'import express from "express"; import { readFileSync } from "node:fs"; const app = express(); app.get("/", (req, res) => { res.send(readFileSync("a")); });',
      errors: blocking('readFileSync', 'fs', 'a request handler'),
    },
    {
      code: 'import express from "express"; import { readFileSync } from "node:fs"; const app = express(); function show(req, res) { res.send(readFileSync("a")); } app.post("/", show);',
      errors: blocking('readFileSync', 'fs', 'a request handler'),
    },
    {
      code: `${EXPRESS} const router = express.Router(); router.route("/").get((req, res) => { res.send(readFileSync("a")); });`,
      errors: blocking('readFileSync', 'fs', 'a request handler'),
    },
    {
      code: 'import { Router } from "express"; import { readFileSync } from "node:fs"; const router = Router(); router.use((req, res) => res.send(readFileSync("a")));',
      errors: blocking('readFileSync', 'fs', 'a request handler'),
    },
    {
      code: 'import type { Express } from "express"; import { readFileSync } from "node:fs"; export function mount(app: Express) { app.get("/", (req, res) => res.send(readFileSync("a"))); }',
      errors: blocking('readFileSync', 'fs', 'a request handler'),
    },
    {
      code: `${FS} export function start() { return (async () => readFileSync("a"))(); }`,
      errors: blocking('readFileSync'),
    },
    {
      code: 'import fs from "node:fs"; export async function real(p) { return fs.realpathSync.native(p); }',
      errors: blocking('realpathSync'),
    },
    {
      code: 'import fs from "node:fs"; export async function load(p) { return fs["readFileSync"](p); }',
      errors: blocking('readFileSync'),
    },
    {
      code: 'import { existsSync } from "node:fs"; export async function has(p) { return existsSync(p); }',
      errors: blocking('existsSync'),
    },
    {
      code: 'import { closeSync } from "node:fs"; export async function close(fd) { closeSync(fd); }',
      errors: blocking('closeSync'),
    },
    {
      code: 'import fs from "fs-extra"; export async function has(p) { return fs.pathExistsSync(p) || fs.existsSync(p); }',
      errors: [...blocking('pathExistsSync', 'fs-extra'), ...blocking('existsSync', 'fs-extra')],
    },
    {
      code: 'import { hkdfSync } from "node:crypto"; export async function derive(k) { return hkdfSync("sha256", k, "", "", 32); }',
      errors: blocking('hkdfSync', 'crypto'),
    },
    {
      code: `${WORKER} ${FS} export async function run() { if (isMainThread) { readFileSync("a"); } }`,
      errors: blocking('readFileSync'),
    },
    {
      code: 'import { Controller, Get as Route } from "@nestjs/common"; import { readFileSync } from "node:fs"; @Controller() export class A { @Route() show() { return readFileSync("a"); } }',
      errors: blocking('readFileSync', 'fs', 'a request handler'),
    },
  ],
});

describe('the allowed form of each call', () => {
  it('names the promise counterpart, or access and stat for existsSync', () => {
    expect(alternativeOf('node:fs', 'readFileSync')).toBe(
      '`await readFile()` from "node:fs/promises"',
    );
    expect(alternativeOf('fs', 'existsSync')).toContain('`access` or `stat`');
    expect(alternativeOf('fs', 'closeSync')).toContain('`FileHandle`');
    expect(alternativeOf('fs-extra', 'pathExistsSync')).toBe(
      '`await pathExists()` from "fs-extra"',
    );
    expect(alternativeOf('fs-extra', 'existsSync')).toBe('`await pathExists()` from "fs-extra"');
    expect(alternativeOf('crypto', 'scryptSync')).toContain('promisify(scrypt)');
    expect(alternativeOf('execa', 'execaCommandSync')).toBe('`await execaCommand()`');
  });
});
