import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule } from './no-production-console.mjs';

const tester = createRuleTester();
const root = '/repo/src/main/composition-root.ts';
const adapter = '/repo/src/main/features/a/adapters/x.ts';
const stream = (name) => [{ messageId: 'streamOutsideRoot', data: { stream: name } }];

tester.run('no-production-console', rule, {
  valid: [
    { code: 'logger.info("x");' },
    { code: 'console[method]("x");' },
    { filename: root, code: 'process.stdout.write("done");' },
    { code: 'out.write("x"); process.stdin.write("x");' },
    { filename: adapter, code: 'export function show(out) { out.write("x"); }' },
    {
      filename: adapter,
      code: 'import { stdin } from "node:process"; export const input = stdin;',
    },
    {
      filename: root,
      code: 'import { stdout } from "node:process"; const { stderr } = process; run(stdout, stderr);',
    },
    { filename: root, code: 'const out = globalThis.process.stdout; run(out, process["stderr"]);' },
  ],
  invalid: [
    { code: 'console.log("x");', errors: [{ messageId: 'consoleCall' }] },
    {
      code: 'console["error"]("x");',
      errors: [{ messageId: 'consoleCall', data: { method: 'error' } }],
    },
    { filename: root, code: 'console.log("x");', errors: [{ messageId: 'consoleCall' }] },
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
      code: 'const { stdout } = require("node:process"); stdout.write("x");',
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
      code: 'const p = process; p.stdout.write("x");',
      errors: stream('stdout'),
    },
  ],
});
