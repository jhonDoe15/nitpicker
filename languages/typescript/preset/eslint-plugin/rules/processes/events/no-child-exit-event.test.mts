import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-child-exit-event.mts';

const tester = typescriptRuleTester();
const CP = "import { spawn, exec, fork } from 'node:child_process';";

function invalid(code: string) {
  return { code, errors: [{ messageId: 'useClose' as const }] };
}

tester.run('no-child-exit-event', rule, {
  valid: [
    `${CP} export const run = () => new Promise((resolve) => { const child = spawn('tool'); let out = ''; child.stdout.on('data', (d) => { out += d; }); child.once('close', (code, signal) => resolve({ code, signal, out })); });`,
    `${CP} export const run = () => { const child = spawn('server'); child.on('exit', (code) => log(code)); };`,
    `${CP} export const run = () => { const child = spawn('server'); child.on('exit', restart); };`,
    `${CP} export const run = () => { const child = spawn('tool'); child.stdout.on('data', collect); child.on('exit', done); child.on('close', finish); };`,
    `${CP} export const run = () => { const child = spawn('tool'); child.on('exit', (code) => { if (code === null) { fail(); } }); };`,
    `${CP} export const run = () => { const child = spawn('tool'); child.on('exit', (code) => resolve(code ?? someDefault)); };`,
    "export const run = (emitter) => { emitter.on('exit', (code) => resolve(code ?? 0)); };",
    "import { spawn } from 'other'; export const run = () => { const child = spawn('x'); child.on('exit', (code) => resolve(code ?? 0)); };",
    `${CP} export const run = () => { const child = spawn('tool'); other.stdout.on('data', collect); child.on('exit', done); };`,
    `${CP} export const run = () => { const child = spawn('tool'); child.on('error', fail); };`,
    `${CP} export const run = (sink) => new Promise((resolve) => { const child = spawn('tool'); child.stdout.pipe(sink); child.on('exit', resolve); });`,
    `${CP} export const run = () => new Promise((resolve) => { const child = spawn('tool'); let out = ''; child.stdout.on('data', (d) => { out += d; }); child.on('exit', async (code) => { await drained(child); resolve({ code, out }); }); });`,
    `${CP} export const run = () => new Promise((resolve) => { const child = spawn('tool'); let out = ''; child.stdout.on('data', (d) => { out += d; }); child.on('exit', (code) => resolve(code)); });`,
    `${CP} export const run = () => new Promise((resolve) => { const child = spawn('tool', [], { stdio: 'inherit' }); child.on('exit', (code) => resolve(code ?? 0)); });`,
    `${CP} export const run = () => new Promise((resolve) => { const child = spawn('tool', { stdio: ['ignore', 'inherit', 'inherit'] }); child.on('exit', (code) => resolve(code || 0)); });`,
    `${CP} export const run = () => new Promise((resolve) => { const child = spawn('tool'); child.on('exit', (code, signal) => resolve(signal ? 1 : (code ?? 0))); });`,
    `${CP} export const run = () => new Promise((resolve) => { const child = spawn('tool'); child.on('exit', (code) => resolve(code ?? 1)); });`,
  ],
  invalid: [
    invalid(
      `${CP} export const run = () => new Promise((resolve) => { const child = spawn('tool'); let stdout = ''; child.stdout.on('data', (d) => { stdout += d; }); child.on('exit', (code) => resolve({ code: code ?? 0, stdout })); });`,
    ),
    invalid(
      `${CP} export const run = () => new Promise((resolve) => { const child = spawn('tool'); child.on('exit', (code) => resolve(code ?? 0)); });`,
    ),
    invalid(
      `${CP} export const run = () => new Promise((resolve) => { spawn('tool').on('exit', (code) => resolve(code || 0)); });`,
    ),
    invalid(
      `${CP} export const run = () => new Promise((resolve) => { const child = exec('tool'); let output = ''; child.stderr.on('data', (d) => { output += d; }); child.once('exit', () => resolve(output)); });`,
    ),
    invalid(
      "const { fork } = require('child_process'); exports.run = () => new Promise((resolve) => { const worker = fork('w.js'); worker.on('exit', (code) => resolve(code ?? 0)); });",
    ),
    invalid(
      `${CP} export const run = async () => { const child = spawn('tool'); let out = ''; for await (const chunk of child.stdout) { out += chunk; } child.addListener('exit', () => finish(out)); };`,
    ),
  ],
});
