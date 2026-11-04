import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule } from './no-production-console.mjs';

const tester = createRuleTester();
const root = '/repo/src/main/composition-root.ts';
const adapter = '/repo/src/main/features/a/adapters/x.ts';
const stream = (name) => [{ messageId: 'streamOutsideRoot', data: { stream: name } }];
const consoleUse = (reference) => [{ messageId: 'consoleCall', data: { reference } }];
const entry = [{ allowStandardStreams: true }];

tester.run('no-production-console', rule, {
  valid: [
    { code: 'logger.info("x");' },
    { code: 'out.write("x"); process.stdin.write("x");' },
    { code: 'export const kind = typeof console;' },
    { filename: root, code: 'process.stdout.write("done");' },
    { filename: adapter, code: 'export function show(out) { out.write("x"); }' },
    {
      filename: adapter,
      code: 'import { stdin } from "node:process"; export const input = stdin;',
    },
    { filename: adapter, code: 'for (const { stdout } of streams) { stdout.write("x"); }' },
    { filename: adapter, code: 'export function f(process) { return process.stdout; }' },
    { filename: adapter, code: 'const process = fake(); export const out = process.stdout;' },
    { filename: adapter, code: 'export function f(console) { console.log("x"); }' },
    { filename: adapter, code: 'import type { stdout } from "node:process";' },
    { filename: adapter, code: 'import { type stderr } from "node:process";' },
    { filename: adapter, code: 'export type { stdout } from "node:process";' },
    { filename: adapter, code: 'export { type stdout } from "node:process";' },
    { filename: adapter, code: 'export type Out = typeof process.stdout;' },
    { filename: adapter, code: 'process.stdout.write("x");', options: entry },
    {
      filename: adapter,
      code: 'const { stderr } = process; export const e = stderr;',
      options: entry,
    },
    {
      filename: root,
      code: 'import { stdout } from "node:process"; const { stderr } = process; run(stdout, stderr);',
    },
    { filename: root, code: 'const out = globalThis.process.stdout; run(out, process["stderr"]);' },
  ],
  invalid: [
    { code: 'console.log("x");', errors: consoleUse('console.log()') },
    { code: 'console["error"]("x");', errors: consoleUse('console.error()') },
    { code: 'console[method]("x");', errors: consoleUse('console[method]()') },
    { filename: root, code: 'console.log("x");', errors: consoleUse('console.log()') },
    {
      filename: adapter,
      code: 'console.log("x");',
      options: entry,
      errors: consoleUse('console.log()'),
    },
    { code: 'const log = console.log;', errors: consoleUse('console.log') },
    { code: 'const { log } = console;', errors: consoleUse('console') },
    { code: 'items.forEach(console.log);', errors: consoleUse('console.log') },
    { code: 'globalThis.console.log("x");', errors: consoleUse('console.log()') },
    { code: 'const c = console; c.log("x");', errors: consoleUse('console') },
    { code: '(console as any).log("x");', errors: consoleUse('console.log()') },
    { code: 'const { console: c } = globalThis; c.log("x");', errors: consoleUse('console') },
    {
      filename: adapter,
      code: 'process.stdout.write("debug"); process.stderr.write("oops");',
      errors: [...stream('stdout'), ...stream('stderr')],
    },
    {
      filename: adapter,
      code: 'const out = process.stdout; out.write("x");',
      errors: stream('stdout'),
    },
    {
      filename: adapter,
      code: 'export const run = () => emit(process.stderr);',
      errors: stream('stderr'),
    },
    {
      filename: adapter,
      code: 'export const tty = process.stdout.isTTY;',
      errors: stream('stdout'),
    },
    { filename: adapter, code: 'process["stdout"].write("x");', errors: stream('stdout') },
    { filename: adapter, code: 'globalThis.process.stdout.write("x");', errors: stream('stdout') },
    { filename: adapter, code: '(process as any).stdout.write("x");', errors: stream('stdout') },
    { filename: adapter, code: '(<any>process).stdout.write("x");', errors: stream('stdout') },
    { filename: adapter, code: 'process!.stdout.write("x");', errors: stream('stdout') },
    { filename: adapter, code: '(process satisfies object).stderr;', errors: stream('stderr') },
    {
      filename: adapter,
      code: 'const g = globalThis; g.process.stdout.write("x");',
      errors: stream('stdout'),
    },
    {
      filename: adapter,
      code: 'const { stdout } = process; stdout.write("x");',
      errors: stream('stdout'),
    },
    {
      filename: adapter,
      code: 'const { stderr: { write } } = process; write("x");',
      errors: stream('stderr'),
    },
    { filename: adapter, code: 'let out; ({ stdout: out } = process);', errors: stream('stdout') },
    {
      filename: adapter,
      code: 'const { ...rest } = process; rest.stdout.write("x");',
      errors: stream('stdout'),
    },
    {
      filename: adapter,
      code: 'const { stdout } = require("node:process"); stdout.write("x");',
      errors: stream('stdout'),
    },
    {
      filename: adapter,
      code: 'const { stdout } = await import("node:process"); stdout.write("x");',
      errors: stream('stdout'),
    },
    {
      filename: adapter,
      code: 'import { stdout as out } from "node:process"; out.write("x");',
      errors: stream('stdout'),
    },
    {
      filename: adapter,
      code: 'import * as proc from "node:process"; proc.stderr.write("x");',
      errors: stream('stderr'),
    },
    {
      filename: adapter,
      code: 'import proc from "process"; proc.stdout.write("x");',
      errors: stream('stdout'),
    },
    { filename: adapter, code: 'export { stdout } from "node:process";', errors: stream('stdout') },
    {
      filename: adapter,
      code: 'export * from "node:process";',
      errors: stream('stdout and process.stderr'),
    },
    {
      filename: adapter,
      code: 'const p = process; p.stdout.write("x");',
      errors: stream('stdout'),
    },
  ],
});
