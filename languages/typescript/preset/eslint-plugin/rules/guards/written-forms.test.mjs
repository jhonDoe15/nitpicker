import { createRuleTester } from './test-support/rule-tester.mjs';
import { rule as noModuleLevelMutableState } from './no-module-level-mutable-state.mjs';
import { rule as noProcessAccess } from './no-process-access-outside-composition-root.mjs';
import { rule as noShellStringCommand } from './no-shell-string-command.mjs';
import { rule as noUnsafePathJoin } from './no-unsafe-path-join.mjs';

const tester = createRuleTester();
const adapter = '/repo/src/main/features/a/adapters/x.ts';
const env = [{ messageId: 'envOutsideRoot' }];
const exit = [{ messageId: 'exitOutsideRoot' }];

tester.run(
  'no-process-access-outside-composition-root however process is reached',
  noProcessAccess,
  {
    valid: [
      { filename: adapter, code: 'import { argv } from "node:process"; export const args = argv;' },
      {
        filename: adapter,
        code: 'import { exit } from "node:process"; if (import.meta.main) { exit(1); }',
      },
      { filename: adapter, code: 'const { argv } = process; export const args = argv;' },
      {
        filename: adapter,
        code: 'export const api = process.env.EXPO_PUBLIC_API_URL; export const cra = process.env["REACT_APP_API_URL"];',
        options: [{ allowBundlerEnv: true }],
      },
    ],
    invalid: [
      {
        filename: adapter,
        code: 'import { env } from "node:process"; export const k = env["K"];',
        errors: env,
      },
      {
        filename: adapter,
        code: 'import * as proc from "node:process"; proc.exit(1);',
        errors: exit,
      },
      {
        filename: adapter,
        code: 'import proc from "process"; export const k = proc.env.K;',
        errors: env,
      },
      {
        filename: adapter,
        code: 'const { env: e } = process; export const k = e["K"];',
        errors: env,
      },
      { filename: adapter, code: 'export const k = globalThis.process.env["K"];', errors: env },
      {
        filename: adapter,
        code: 'export function halt() { const { exit } = process; exit(1); }',
        errors: exit,
      },
      { filename: adapter, code: 'const p = process; export const k = p.env.K;', errors: env },
      {
        filename: adapter,
        code: 'const { env } = require("node:process"); export const k = env.K;',
        errors: env,
      },
      {
        filename: adapter,
        code: 'const { env: { K } } = process; export const k = K;',
        errors: env,
      },
      {
        filename: adapter,
        code: 'import { env } from "node:process"; export const api = env.EXPO_PUBLIC_API_URL;',
        options: [{ allowBundlerEnv: true }],
        errors: env,
      },
    ],
  },
);

const shellProgram = [{ messageId: 'shellProgram' }];

tester.run(
  'no-shell-string-command through a shell program or shared options',
  noShellStringCommand,
  {
    valid: [
      { code: 'import { spawn } from "node:child_process"; spawn("sh", ["-c", "git status"]);' },
      { code: 'import { spawn } from "node:child_process"; spawn("sh", ["script.sh", ref]);' },
      {
        code: 'import { execFileSync } from "node:child_process"; const OPTIONS = { shell: false }; execFileSync(p, args, OPTIONS);',
      },
    ],
    invalid: [
      {
        code: 'import { spawn } from "node:child_process"; spawn("sh", ["-c", `git log ${ref}`]);',
        errors: [{ messageId: 'shellProgram', data: { program: 'sh', flag: '-c' } }],
      },
      {
        code: 'import { spawnSync } from "node:child_process"; spawnSync("bash", ["-lc", cmd]);',
        errors: shellProgram,
      },
      {
        code: 'import { execFile } from "node:child_process"; execFile("/bin/zsh", ["-c", cmd]);',
        errors: shellProgram,
      },
      {
        code: 'import { spawn } from "node:child_process"; spawn("cmd.exe", ["/c", cmd]);',
        errors: shellProgram,
      },
      {
        code: 'import { execFileSync } from "node:child_process"; const SHELL_OPTIONS = { shell: true } as const; execFileSync(p, args, SHELL_OPTIONS);',
        errors: [{ messageId: 'shellString' }],
      },
      {
        code: 'import { spawn } from "node:child_process"; const BASE = { shell: true }; const OPTIONS = { ...BASE, cwd }; spawn(p, args, OPTIONS);',
        errors: [{ messageId: 'shellString' }],
      },
    ],
  },
);

const imports =
  'import { readFile, cp, lstat, opendir } from "node:fs/promises"; import path from "node:path";';
const BASE = 'const BASE = "/srv";';
const unsafe = [{ messageId: 'unsafePath' }];

function inFunction(body) {
  return `${imports} ${BASE} export async function f(name) { ${body} }`;
}

tester.run('no-unsafe-path-join however the path is built and checked', noUnsafePathJoin, {
  valid: [
    inFunction(
      'const full = path.resolve(BASE, name); if (!full.startsWith(BASE + path.sep)) { return ""; } return readFile(full);',
    ),
    inFunction(
      'const full = path.resolve(BASE, name); if (!full.startsWith(`${BASE}${path.sep}`)) throw new Error("x"); return readFile(full);',
    ),
    inFunction(
      'const full = path.join(BASE, name); const rel = path.relative(BASE, full); if (rel.startsWith("..") || path.isAbsolute(rel)) { return ""; } return readFile(full);',
    ),
    inFunction(
      'const full = path.resolve(BASE, name); if (full.startsWith(BASE + path.sep)) { return readFile(full); } return "";',
    ),
    inFunction('return readFile(`${name}.json`);'),
    inFunction('return readFile(name + ".json");'),
  ],
  invalid: [
    { code: inFunction('return readFile(`${BASE}/${name}`);'), errors: unsafe },
    { code: inFunction('return readFile(BASE + "/" + name);'), errors: unsafe },
    { code: inFunction('return readFile(`/srv/${name}`);'), errors: unsafe },
    { code: inFunction('return readFile(path.normalize(path.join(BASE, name)));'), errors: unsafe },
    { code: inFunction('return readFile(path.resolve(path.join(BASE, name)));'), errors: unsafe },
    {
      code: inFunction(
        'let full = path.join(BASE, name); full = full.trim(); return readFile(full);',
      ),
      errors: unsafe,
    },
    { code: inFunction('await cp(path.join(BASE, name), "/tmp/out");'), errors: unsafe },
    { code: inFunction('await lstat(path.join(BASE, name));'), errors: unsafe },
    { code: inFunction('await opendir(path.join(BASE, name));'), errors: unsafe },
    {
      code: inFunction(
        'const full = path.resolve(BASE, name); if (!full.startsWith(BASE)) { return ""; } return readFile(full);',
      ),
      errors: unsafe,
    },
    {
      code: inFunction(
        'const full = path.join(BASE, name); if (full.startsWith("/")) { return ""; } return readFile(full);',
      ),
      errors: unsafe,
    },
    {
      code: inFunction(
        'const full = path.join(BASE, name); console.info(path.relative(BASE, full)); return readFile(full);',
      ),
      errors: unsafe,
    },
    {
      code: inFunction(
        'const full = path.resolve(BASE, name); if (!full.startsWith(BASE + path.sep)) { log(full); } return readFile(full);',
      ),
      errors: unsafe,
    },
    {
      code: inFunction(
        'const full = path.resolve(BASE, name); if (ok) { if (!full.startsWith(BASE + path.sep)) return ""; } return readFile(full);',
      ),
      errors: unsafe,
    },
  ],
});

tester.run('no-module-level-mutable-state through aliases and Reflect', noModuleLevelMutableState, {
  valid: [
    {
      filename: adapter,
      code: 'const cache = new Map(); const registry = cache; export function get(k) { return registry.get(k); }',
    },
    {
      filename: adapter,
      code: 'const counters = {}; export function read(k) { return Reflect.get(counters, k); }',
    },
  ],
  invalid: [
    {
      filename: adapter,
      code: 'const cache = new Map(); const registry = cache; export function put(k, v) { registry.set(k, v); }',
      errors: [{ messageId: 'moduleState', data: { name: 'cache' } }],
    },
    {
      filename: adapter,
      code: 'const cache = new Map(); export function put(k, v) { const local = cache; local.set(k, v); }',
      errors: [{ messageId: 'moduleState', data: { name: 'cache' } }],
    },
    {
      filename: adapter,
      code: 'const counters = {}; export function bump(k) { Reflect.set(counters, k, 1); }',
      errors: [{ messageId: 'moduleState', data: { name: 'counters' } }],
    },
    {
      filename: adapter,
      code: 'const table = {}; export function add(k) { Object.defineProperty(table, k, { value: 1 }); }',
      errors: [{ messageId: 'moduleState', data: { name: 'table' } }],
    },
  ],
});
