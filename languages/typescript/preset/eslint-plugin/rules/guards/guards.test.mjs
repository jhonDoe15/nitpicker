import { createRuleTester } from './test-support/rule-tester.mjs';
import { rule as noModuleLevelMutableState } from './no-module-level-mutable-state.mjs';
import { rule as noProcessAccess } from './no-process-access-outside-composition-root.mjs';
import { rule as noShellStringCommand } from './no-shell-string-command.mjs';
import { rule as noUnknownMainFolder } from './no-unknown-main-folder.mjs';
import { rule as noUnsafePathJoin } from './no-unsafe-path-join.mjs';

const tester = createRuleTester();
const adapter = '/repo/src/main/features/a/adapters/x.ts';

tester.run('no-module-level-mutable-state', noModuleLevelMutableState, {
  valid: [
    {
      filename: adapter,
      code: 'const names = ["a"]; export function first() { return names[0]; }',
    },
    {
      filename: adapter,
      code: 'const cache = new Map(); export function size() { return cache.size; }',
    },
    {
      filename: adapter,
      code: 'export function f() { const cache = new Map(); cache.set(1, 2); return cache; }',
    },
    { filename: adapter, code: 'const table = { a: 1 }; export const copy = { ...table, b: 2 };' },
    {
      filename: '/repo/src/main/composition-root.ts',
      code: 'const cache = new Map(); export function wire() { cache.set(1, 2); }',
    },
    {
      filename: adapter,
      code: 'const set = new Set(); export function has(x) { return set.has(x); }',
    },
    { filename: adapter, code: 'export const NAMES = ["a", "b"];' },
    {
      filename: adapter,
      code: 'export function table() { const byId = new Map(); byId.set(1, 2); return byId; }',
    },
    {
      filename: adapter,
      code: 'const http = { get, delete: (url) => send(url) }; export function drop(u) { http.delete(u); }',
    },
    {
      filename: adapter,
      code: 'const api = Object.create(base); export function reset() { api.clear(); }',
    },
    { filename: adapter, code: 'export const byId: ReadonlyMap<string, number> = new Map();' },
    { filename: adapter, code: 'export const seen: ReadonlySet<string> = new Set(["a"]);' },
    {
      filename: adapter,
      code: 'export const bytes: readonly number[] = new Uint8Array(2);',
    },
  ],
  invalid: [
    {
      filename: adapter,
      code: 'const cache = new Map(); export function put(k, v) { cache.set(k, v); }',
      errors: [{ messageId: 'moduleState', data: { name: 'cache' } }],
    },
    {
      filename: adapter,
      code: 'export const counters: Record<string, number> = {}; export function bump(k) { counters[k] = 1; }',
      errors: [{ messageId: 'moduleState', data: { name: 'counters' } }],
    },
    {
      filename: adapter,
      code: 'const state = { items: [] }; export function add(x) { state.items.push(x); }',
      errors: [{ messageId: 'moduleState', data: { name: 'state' } }],
    },
    {
      filename: adapter,
      code: 'const lookup = Object.create(null); export function put(k) { lookup[k] = 1; }',
      errors: [{ messageId: 'moduleState', data: { name: 'lookup' } }],
    },
    {
      filename: adapter,
      code: 'const buffer = new Uint8Array(8); export function poke() { buffer.fill(1); }',
      errors: [{ messageId: 'moduleState', data: { name: 'buffer' } }],
    },
    {
      filename: adapter,
      code: 'export const registry = new Map();',
      errors: [{ messageId: 'exportedState', data: { name: 'registry' } }],
    },
    {
      filename: adapter,
      code: 'export const registry: Map<string, number> = new Map();',
      errors: [{ messageId: 'exportedState', data: { name: 'registry' } }],
    },
    {
      filename: adapter,
      code: 'const http = { get }; export function drop(u) { delete http.get; }',
      errors: [{ messageId: 'moduleState', data: { name: 'http' } }],
    },
    {
      filename: adapter,
      code: 'const table = { a: 1 }; export function fill(x) { Object.assign(table, x); }',
      errors: [{ messageId: 'moduleState', data: { name: 'table' } }],
    },
    {
      filename: adapter,
      code: 'export const state = { count: 0 }; export function bump() { state.count++; }',
      errors: [{ messageId: 'moduleState' }],
    },
    {
      filename: adapter,
      code: 'const listeners = new Set<() => void>(); export function on(f) { listeners.add(f); }',
      errors: [{ messageId: 'moduleState' }],
    },
    {
      filename: adapter,
      code: 'const items = [] as string[]; export function add(x) { items.push(x); }',
      errors: [{ messageId: 'moduleState' }],
    },
    {
      filename: adapter,
      code: 'const config = {}; export function load(x) { Object.assign(config, x); }',
      errors: [{ messageId: 'moduleState' }],
    },
    {
      filename: adapter,
      code: 'const cache = { a: { b: 1 } }; export function clear() { delete cache.a.b; }',
      errors: [{ messageId: 'moduleState' }],
    },
  ],
});

tester.run('no-process-access-outside-composition-root', noProcessAccess, {
  valid: [
    { filename: '/repo/src/main/composition-root.ts', code: 'const port = process.env["PORT"];' },
    { filename: '/repo/src/main/server.ts', code: 'process.exit(1);' },
    { filename: adapter, code: 'export function f(env) { return env.PORT; }' },
    { filename: adapter, code: 'if (import.meta.main) { process.exit(main()); }' },
    { filename: adapter, code: 'export const args = process.argv;' },
    { filename: '/repo/src/other/src/main/composition-root/wire.ts', code: 'process.env.A;' },
    {
      filename: adapter,
      code: 'export const dev = import.meta.env.DEV;',
      options: [{ allowImportMetaEnv: true }],
    },
    {
      filename: adapter,
      code: 'export const dev = process.env.NODE_ENV !== "production";',
      options: [{ allowBundlerEnv: true }],
    },
    {
      filename: adapter,
      code: 'export const api = process.env["NEXT_PUBLIC_API_URL"];',
      options: [{ allowBundlerEnv: true }],
    },
  ],
  invalid: [
    {
      filename: adapter,
      code: 'export const url = process.env["API_URL"];',
      errors: [{ messageId: 'envOutsideRoot' }],
    },
    {
      filename: adapter,
      code: 'export const url = process.env.API_URL;',
      errors: [{ messageId: 'envOutsideRoot' }],
    },
    {
      filename: adapter,
      code: 'export const url = import.meta.env.VITE_URL;',
      errors: [{ messageId: 'envOutsideRoot' }],
    },
    {
      filename: adapter,
      code: 'export const url = process.env.API_URL;',
      options: [{ allowImportMetaEnv: true }],
      errors: [{ messageId: 'envOutsideRoot' }],
    },
    {
      filename: adapter,
      code: 'export const url = process.env.API_URL;',
      options: [{ allowBundlerEnv: true }],
      errors: [{ messageId: 'envOutsideRoot' }],
    },
    {
      filename: adapter,
      code: 'export const env = process.env;',
      options: [{ allowBundlerEnv: true }],
      errors: [{ messageId: 'envOutsideRoot' }],
    },
    {
      filename: adapter,
      code: 'export const mode = process.env.NODE_ENV;',
      errors: [{ messageId: 'envOutsideRoot' }],
    },
    {
      filename: adapter,
      code: 'export const url = Deno.env.get("A");',
      errors: [{ messageId: 'envOutsideRoot' }],
    },
    {
      filename: adapter,
      code: 'export const env = process["env"];',
      errors: [{ messageId: 'envOutsideRoot' }],
    },
    {
      filename: adapter,
      code: 'export function stop() { process.exit(1); }',
      errors: [{ messageId: 'exitOutsideRoot' }],
    },
    {
      filename: '/repo/src/main/features/a/server.ts',
      code: 'export function stop() { process.exit(1); }',
      errors: [{ messageId: 'exitOutsideRoot' }],
    },
  ],
});

tester.run('no-shell-string-command', noShellStringCommand, {
  valid: [
    { code: 'import { execFile } from "node:child_process"; execFile("ls", [dir]);' },
    { code: 'import { exec } from "node:child_process"; exec("ls -la");' },
    { code: 'import { exec } from "node:child_process"; exec(`ls -la`);' },
    { code: 'import { spawn } from "node:child_process"; spawn("ls", [dir], { shell: false });' },
    { code: 'const exec = (x) => x; exec(`ls ${dir}`);' },
    { code: 'import { exec } from "other"; exec(`ls ${dir}`);' },
    { code: 'import { exec } from "node:child_process"; const cmd = "git status"; exec(cmd);' },
    {
      code: 'import { exec } from "node:child_process"; import { promisify } from "node:util"; const run = promisify(exec); await run("ls");',
    },
  ],
  invalid: [
    {
      code: 'import { execSync } from "node:child_process"; execSync(`ls ${dir}`);',
      errors: [{ messageId: 'shellString' }],
    },
    {
      code: 'import { exec } from "child_process"; exec("ls " + dir);',
      errors: [{ messageId: 'shellString' }],
    },
    {
      code: 'import * as cp from "node:child_process"; cp.exec(command);',
      errors: [{ messageId: 'shellString' }],
    },
    {
      code: 'import cp from "node:child_process"; cp.execSync(command, { stdio: "inherit" });',
      errors: [{ messageId: 'shellString' }],
    },
    {
      code: 'import { spawn } from "node:child_process"; spawn("ls", [dir], { shell: true });',
      errors: [{ messageId: 'shellString' }],
    },
    {
      code: 'import { execFileSync } from "node:child_process"; execFileSync(program, [], { shell: "/bin/sh" });',
      errors: [{ messageId: 'shellString' }],
    },
    {
      code: 'import { exec } from "node:child_process"; import { promisify } from "node:util"; const run = promisify(exec); await run(`ls ${dir}`);',
      errors: [{ messageId: 'shellString' }],
    },
    {
      code: 'import * as cp from "node:child_process"; import util from "node:util"; const run = util.promisify(cp.execSync); run(command);',
      errors: [{ messageId: 'shellString' }],
    },
    {
      code: 'import { exec } from "node:child_process"; let cmd = "ls"; exec(cmd);',
      errors: [{ messageId: 'shellString' }],
    },
  ],
});

tester.run('no-unknown-main-folder', noUnknownMainFolder, {
  valid: [
    { filename: '/repo/src/main/features/a/index.ts', code: 'export const a = 1;' },
    { filename: '/repo/src/main/shared/clock.ts', code: 'export const a = 1;' },
    { filename: '/repo/src/main/composition-root/wire.ts', code: 'export const a = 1;' },
    { filename: '/repo/src/main/composition-root.ts', code: 'export const a = 1;' },
    { filename: '/repo/src/main/index.ts', code: 'export const a = 1;' },
    { filename: '/repo/src/utils/strings.ts', code: 'export const a = 1;' },
    { filename: '/repo/lib/main/utils/strings.ts', code: 'export const a = 1;' },
    { filename: '/repo/src/main/server.ts', code: 'export const a = 1;' },
    { filename: '/repo/src/main/main.tsx', code: 'export const a = 1;' },
    { filename: '/repo/src/main/features/a/domain/deep/b.ts', code: 'export const a = 1;' },
    { filename: '/repo/src/main/features/a/adapters/b.ts', code: 'export const a = 1;' },
    { filename: '/repo/src/main/features/a/index.tsx', code: 'export const a = 1;' },
    {
      filename: '/repo/src/main/features/a/ui/panel.tsx',
      code: 'export const a = 1;',
      options: [{ react: true }],
    },
    {
      filename: '/repo/src/main/components/panel.tsx',
      code: 'export const a = 1;',
      options: [{ react: true }],
    },
    { filename: '/repo/src/main/App.tsx', code: 'export const a = 1;', options: [{ react: true }] },
  ],
  invalid: [
    {
      filename: '/repo/src/main/features/auth/services/login.ts',
      code: 'export const a = 1;',
      errors: [{ messageId: 'unknownFeatureFolder', data: { folder: 'services' } }],
    },
    {
      filename: '/repo/src/main/features/auth/helpers.ts',
      code: 'export const a = 1;',
      errors: [{ messageId: 'looseFeatureFile', data: { folder: 'helpers.ts' } }],
    },
    {
      filename: '/repo/src/main/features/auth/ui/panel.tsx',
      code: 'export const a = 1;',
      errors: [{ messageId: 'unknownFeatureFolder', data: { folder: 'ui' } }],
    },
    {
      filename: '/repo/src/main/services/api.ts',
      code: 'export const a = 1;',
      options: [{ react: true }],
      errors: [{ messageId: 'unknownFolder', data: { folder: 'services' } }],
    },
    {
      filename: '/repo/src/main/features/auth/components/panel.tsx',
      code: 'export const a = 1;',
      options: [{ react: true }],
      errors: [{ messageId: 'unknownFeatureFolder', data: { folder: 'components' } }],
    },
    {
      filename: '/repo/src/main/helpers.ts',
      code: 'export const a = 1;',
      errors: [{ messageId: 'looseFile', data: { folder: 'helpers.ts' } }],
    },
    {
      filename: '/repo/src/main/utils/strings.ts',
      code: 'export const a = 1;',
      errors: [{ messageId: 'unknownFolder', data: { folder: 'utils' } }],
    },
    {
      filename: 'src/main/services/order-service.ts',
      code: 'export const a = 1;',
      errors: [{ messageId: 'unknownFolder', data: { folder: 'services' } }],
    },
    {
      filename: '/repo/lib/main/models/user.ts',
      code: 'export const a = 1;',
      options: [{ sourceRoots: ['lib'] }],
      errors: [{ messageId: 'unknownFolder', data: { folder: 'models' } }],
    },
    {
      filename: '/repo/packages/api/src/main/utils/x.ts',
      code: 'export const a = 1;',
      options: [{ sourceRoots: ['packages/api/src'] }],
      errors: [{ messageId: 'unknownFolder' }],
    },
  ],
});

tester.run('no-unsafe-path-join', noUnsafePathJoin, {
  valid: [
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f() { return readFileSync(path.join("/srv", "a.txt")); }',
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(name) { const full = path.resolve("/srv", name); if (!full.startsWith("/srv/")) { return undefined; } return readFileSync(full); }',
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(dir) { return readFileSync(path.join(dir, "package.json")); }',
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(name) { const full = path.join("/srv", name); if (path.relative("/srv", full).startsWith("..")) { return undefined; } return readFileSync(full); }',
    },
    {
      code: 'import { readFileSync } from "node:fs"; export function f(name) { return readFileSync(name); }',
    },
    {
      code: 'import path from "node:path"; export function f(name) { return path.join("/srv", name); }',
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(name) { const full = path.join("/srv", name); if (!path.resolve(full).startsWith("/srv/")) { return undefined; } return readFileSync(full); }',
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(name) { return readFileSync(path.join("/srv", path.basename(name))); }',
    },
  ],
  invalid: [
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(userPath) { return readFileSync(path.join("/srv/data", userPath)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import fs from "node:fs/promises"; import * as path from "node:path"; export async function f(name) { return fs.readFile(path.resolve("/srv", `${name}.json`), "utf8"); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { unlink } from "fs"; import { join } from "path"; export function f(request) { const target = join("/srv", request.file); unlink(target); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { writeFileSync } from "node:fs"; import { join } from "node:path"; export const f = (name) => writeFileSync(join(base, name), "x");',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(name) { return readFileSync(path.join("/srv", name)); if (path.relative("/srv", name)) { return 1; } }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(c) { const file = c.req.param("file"); const full = path.join("/srv", file); return readFileSync(full); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(req, other) { const full = path.join("/srv", req.query.x); if (other.startsWith("/srv")) { return 1; } return readFileSync(full); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(name) { return readFileSync(path.join("/srv", name as string)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(name) { return readFileSync(path.join("/srv", name!)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(name) { return readFileSync(path.join("/srv", name || "index.html")); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(name, fallback) { return readFileSync(path.join("/srv", name ? name : fallback)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(parts) { return readFileSync(path.join("/srv", ...parts)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(req) { return readFileSync(path.join("/srv", req?.query?.file)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { readFileSync } from "node:fs"; import path from "node:path"; export function f(name) { return readFileSync(path.join("/srv", decodeURIComponent(name))); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { promises as fsp } from "node:fs"; import path from "node:path"; export async function f(name) { return fsp.readFile(path.join("/srv", name)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { renameSync } from "node:fs"; import path from "node:path"; export function f(name) { renameSync("/tmp/upload", path.join("/srv", name)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { copyFile } from "node:fs/promises"; import path from "node:path"; export async function f(name) { await copyFile(path.join("/srv", name), "/tmp/out"); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { statSync } from "node:fs"; import path from "node:path"; export function f(name) { return statSync(path.join("/srv", name)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { access } from "node:fs/promises"; import path from "node:path"; export async function f(name) { await access(path.join("/srv", name)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { mkdirSync } from "node:fs"; import path from "node:path"; export function f(name) { mkdirSync(path.join("/srv", name)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { open } from "node:fs/promises"; import path from "node:path"; export async function f(name) { return open(path.join("/srv", name)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { readlinkSync } from "node:fs"; import path from "node:path"; export function f(name) { return readlinkSync(path.join("/srv", name)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import { truncateSync } from "node:fs"; import path from "node:path"; export function f(name) { truncateSync(path.join("/srv", name)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
    {
      code: 'import path from "node:path"; export function f(req, res) { res.sendFile(path.join("/srv", req.params.file)); }',
      errors: [{ messageId: 'unsafePath' }],
    },
  ],
});
