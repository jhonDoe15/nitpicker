import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './require-process-timeout.mjs';

const tester = typescriptRuleTester();
const CP =
  "import { exec, execFile, execFileSync, execSync, fork, spawn, spawnSync } from 'node:child_process';";
const EVENTS = "import { once } from 'node:events';";

function invalid(code, method, messageId = 'missingDeadline') {
  return { code, errors: [{ messageId, data: { method } }] };
}

tester.run('require-process-timeout', rule, {
  valid: [
    `${CP} execFileSync('git', ['status'], { timeout: 30_000 });`,
    `${CP} const LIMIT = { timeout: 30_000 }; execSync('make', LIMIT);`,
    `${CP} spawnSync('git', [], { cwd: '/repo', timeout: 1000 });`,
    `${CP} exec('make', { timeout: 30_000 }, (error) => error);`,
    `${CP} execFile('tool', ['a'], { signal: AbortSignal.timeout(30_000) }, done);`,
    `${CP} export const run = (options) => execFileSync('tool', [], options);`,
    `${CP} export const run = (args) => execFileSync(...args);`,
    `${CP} export function serve() { const child = spawn('server', []); child.on('exit', restart); }`,
    `${CP} export function start() { return spawn('server', []); }`,
    `${CP} export function run() { return new Promise((resolve) => { const child = spawn('tool', [], { timeout: 1000 }); child.on('close', resolve); }); }`,
    `${CP} export function run() { return new Promise((resolve) => { const child = spawn('tool', []); setTimeout(() => child.kill(), 1000); child.on('close', resolve); }); }`,
    `${CP} export function run() { return new Promise((resolve) => { const child = spawn('tool', []); track(child); child.on('close', resolve); }); }`,
    `${CP} export function run() { return new Promise((resolve) => { const child = spawn('tool', []); child.stdout.on('close', resolve); }); }`,
    `${CP} export function run(signal) { return new Promise((resolve) => { spawn('tool', [], { signal }).on('exit', resolve); }); }`,
    `${CP} ${EVENTS} export async function run() { const child = fork('worker.js', [], { timeout: 1000 }); await once(child, 'exit'); }`,
    "import { execa } from 'execa'; export async function run() { await execa('tool', [], { timeout: 1000 }); }",
    "import { execa } from 'execa'; export async function run() { await execa('tool', { cancelSignal: AbortSignal.timeout(1000) }); }",
    "import { execa } from 'execa'; export function start() { return execa('server'); }",
    "import { execSync } from 'other-library'; execSync('tool');",
    `${CP} export const run = (timeout) => execSync('tool', { timeout });`,
    `${CP} execSync('tool', { ...external() });`,
    `${CP} export function run() { return new Promise((resolve) => { fork('worker.js', [], { signal: AbortSignal.timeout(1000) }).on('exit', resolve); }); }`,
    "const { execFileSync } = require('node:child_process'); module.exports = (args) => execFileSync('git', args, { timeout: 30000 });",
    "import { execaNode } from 'execa'; export async function run() { await execaNode('worker.js', [], { timeout: 1000 }); }",
    "import spawn from 'cross-spawn'; import { once } from 'node:events'; export async function run() { const child = spawn('tool', [], { timeout: 1000 }); await once(child, 'close'); }",
    "import { $ } from 'execa'; export async function run() { await $({ timeout: 1000 })`make`; }",
    "import { $ } from 'execa'; export function start() { return $`server`; }",
    "import { $ } from 'execa'; $.sync({ timeout: 1000 })`make`;",
    "import { execa } from 'execa'; export async function run() { await execa({ cancelSignal: AbortSignal.timeout(1) })`make`; }",
    "import spawn from 'cross-spawn'; spawn.sync('tool', [], { timeout: 1000 });",
  ],
  invalid: [
    invalid("import { $ } from 'execa'; export async function run() { await $`make`; }", '$'),
    invalid(
      "import { $ } from 'execa'; export async function run() { await $({ cwd: '/repo' })`make`; }",
      '$',
    ),
    invalid("import { $ } from 'execa'; $.sync`make`;", '$.sync', 'missingTimeout'),
    invalid(
      "import { execaSync } from 'execa'; execaSync({ cwd: '/repo' })`make`;",
      'execaSync',
      'missingTimeout',
    ),
    invalid(
      "import spawn from 'cross-spawn'; spawn.sync('tool', []);",
      'spawnSync',
      'missingTimeout',
    ),
    invalid(
      "import { promisify } from 'node:util'; import { execFile } from 'node:child_process'; export async function f() { const run = promisify(execFile); await run('git', ['a']); }",
      'execFile',
    ),
    invalid(
      "import { promisify } from 'node:util'; import { exec } from 'node:child_process'; export async function f() { await promisify(exec)('make'); }",
      'exec',
    ),
    invalid(`${CP} execFileSync('git', ['status']);`, 'execFileSync', 'missingTimeout'),
    invalid(`${CP} execSync('make', { encoding: 'utf8' });`, 'execSync', 'missingTimeout'),
    invalid(`${CP} spawnSync('tool', [], { timeout: 0 });`, 'spawnSync', 'missingTimeout'),
    invalid(`${CP} exec('make', (error) => error);`, 'exec'),
    invalid(`${CP} function done() {} execFile('tool', ['a'], done);`, 'execFile'),
    invalid(`${CP} execFile('tool', ['a'], { signal: undefined }, (error) => error);`, 'execFile'),
    invalid(
      "import { promisify } from 'node:util'; import { execFile } from 'node:child_process'; const run = promisify(execFile); export async function f() { await run('tool', []); }",
      'execFile',
    ),
    invalid(
      `${CP} export function run() { return new Promise((resolve, reject) => { const child = spawn('tool', []); child.on('error', reject); child.on('close', resolve); }); }`,
      'spawn',
    ),
    invalid(
      `${CP} export function run() { return new Promise((resolve, reject) => { spawn('tool', []).on('error', reject).once('exit', resolve); }); }`,
      'spawn',
    ),
    invalid(
      `${CP} ${EVENTS} export async function run() { const child = fork('worker.js'); await once(child, 'exit'); }`,
      'fork',
    ),
    invalid(
      "import * as events from 'node:events'; import cp from 'node:child_process'; export async function run() { const child = cp.spawn('tool', [], { stdio: 'inherit' }); await events.once(child, 'close'); }",
      'spawn',
    ),
    invalid(
      "import { execa } from 'execa'; export async function run() { await execa('tool', ['a']); }",
      'execa',
    ),
    invalid(
      "import { execaCommand } from 'execa'; export function run() { return execaCommand('make all').then((result) => result.stdout); }",
      'execaCommand',
    ),
    invalid(
      "import { execa } from 'execa'; export async function run() { const pending = execa('tool'); return await pending; }",
      'execa',
    ),
    invalid(
      "import { execaSync } from 'execa'; execaSync('tool', [], { signal: AbortSignal.timeout(1) });",
      'execaSync',
      'missingTimeout',
    ),
  ],
});
