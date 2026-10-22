import { typescriptRuleTester } from '../test-support/rule-tester.mjs';
import { rule } from '../rules/testing/processes/timeouts/require-test-process-timeout.mjs';

const tester = typescriptRuleTester();

tester.run('require-test-process-timeout', rule, {
  valid: [
    "import { spawnSync } from 'node:child_process'; spawnSync('tool', [], { timeout: 1 });",
    "import { execSync } from 'child_process'; const SECOND = 1000; const OPTIONS = { timeout: SECOND * 90 }; execSync('tool', OPTIONS);",
    "import * as cp from 'node:child_process'; cp.execFileSync('tool', { timeout: 1000 } as const);",
    "const cp = require('node:child_process'); const BASE = { timeout: 1000 }; cp.spawnSync('tool', [], { ...BASE, cwd: '/tmp' });",
    "import { spawn } from 'node:child_process'; spawn('tool', []);",
    "import { spawnSync } from 'other-library'; spawnSync('tool');",
    "import * as cp from 'node:child_process'; function unrelated(cp) { cp.spawnSync('tool'); }",
    "import { spawnSync } from 'node:child_process'; function unrelated(spawnSync) { spawnSync('tool'); }",
    "import { spawnSync } from 'node:child_process'; export const run = (timeout) => spawnSync('tool', [], { timeout });",
    "import { execSync } from 'node:child_process'; export const run = (options) => execSync('tool', options);",
    "import { spawnSync } from 'node:child_process'; const OPTIONS = external(); spawnSync('tool', [], { ...OPTIONS });",
    "import { spawnSync } from 'node:child_process'; spawnSync('tool', [], { timeout: 0, ...external() });",
    "import { execSync } from 'node:child_process'; const OPTIONS = {}; OPTIONS.timeout = 1000; execSync('tool', OPTIONS);",
    "import { execSync } from 'node:child_process'; const OPTIONS = {}; configure(OPTIONS); execSync('tool', OPTIONS);",
    "import { execSync } from 'node:child_process'; const OPTIONS = {}; const ALIAS = OPTIONS; ALIAS.timeout = 1000; execSync('tool', OPTIONS);",
    "import { execSync } from 'node:child_process'; const OPTIONS = { ...OPTIONS }; execSync('tool', OPTIONS);",
    "import { execSync } from 'node:child_process'; const ARGS = ['tool', { timeout: 1000 }]; execSync(...ARGS);",
    "import { spawnSync } from 'node:child_process'; export const run = (args) => spawnSync(...args);",
    "const require = (name) => ({ execSync: (command) => command }); const cp = require('node:child_process'); cp.execSync('tool');",
    "import { execSync } from 'node:child_process'; const OPTIONS = {}; OPTIONS.timeout = 1000; execSync('tool', OPTIONS as object);",
    "import { execSync } from 'node:child_process'; const OPTIONS = {}; configure(); execSync('tool', OPTIONS); function configure() { OPTIONS.timeout = 1000; }",
    "import { execSync } from 'node:child_process'; const OPTIONS = {}; OPTIONS.timeout = 1000; const ALIAS = OPTIONS; execSync('tool', ALIAS);",
    "import { execSync } from 'node:child_process'; const OPTIONS = {}; configure(OPTIONS as object); execSync('tool', OPTIONS);",
    "import { execSync } from 'node:child_process'; const OPTIONS = {}; configure(() => OPTIONS); execSync('tool', OPTIONS);",
    "import { execSync } from 'node:child_process'; const OPTIONS = {}; const BOX = { options: OPTIONS }; configure(BOX); execSync('tool', OPTIONS);",
  ],
  invalid: [
    {
      code: "import { spawnSync } from 'node:child_process'; spawnSync('tool');",
      errors: [{ messageId: 'missingTimeout', data: { method: 'spawnSync' } }],
    },
    {
      code: "import { execSync as run } from 'child_process'; run('tool', { encoding: 'utf8' });",
      errors: [{ messageId: 'missingTimeout', data: { method: 'execSync' } }],
    },
    {
      code: "import cp from 'node:child_process'; cp.execFileSync('tool', []);",
      errors: [{ messageId: 'missingTimeout', data: { method: 'execFileSync' } }],
    },
    {
      code: "import * as cp from 'node:child_process'; cp['spawnSync']('tool', { timeout: 0 });",
      errors: [{ messageId: 'missingTimeout', data: { method: 'spawnSync' } }],
    },
    {
      code: "const { execFileSync: run } = require('child_process'); run('tool', undefined, { timeout: -1 });",
      errors: [{ messageId: 'missingTimeout', data: { method: 'execFileSync' } }],
    },
    {
      code: "const cp = require('node:child_process'); cp.execSync('tool', { timeout: undefined });",
      errors: [{ messageId: 'missingTimeout', data: { method: 'execSync' } }],
    },
    {
      code: "import { spawnSync } from 'node:child_process'; const TIMEOUT = 1000 - 1000; const OPTIONS = { timeout: TIMEOUT }; spawnSync('tool', [], OPTIONS);",
      errors: [{ messageId: 'missingTimeout', data: { method: 'spawnSync' } }],
    },
    {
      code: "import { spawnSync } from 'node:child_process'; const OPTIONS = { cwd: '/tmp' } satisfies object; spawnSync('tool', [], OPTIONS);",
      errors: [{ messageId: 'missingTimeout', data: { method: 'spawnSync' } }],
    },
    {
      code: "import { execSync } from 'node:child_process'; const BASE = { timeout: 1000 }; execSync('tool', { ...BASE, timeout: 0 });",
      errors: [{ messageId: 'missingTimeout', data: { method: 'execSync' } }],
    },
    {
      code: "import { execSync } from 'node:child_process'; const DISABLED = { timeout: 0 }; execSync('tool', { timeout: 1000, ...DISABLED });",
      errors: [{ messageId: 'missingTimeout', data: { method: 'execSync' } }],
    },
    {
      code: "import { execSync } from 'node:child_process'; execSync('tool', { ...external(), ['timeout']: 0 });",
      errors: [{ messageId: 'missingTimeout', data: { method: 'execSync' } }],
    },
    {
      code: "import { spawnSync } from 'node:child_process'; spawnSync('tool', null);",
      errors: [{ messageId: 'missingTimeout', data: { method: 'spawnSync' } }],
    },
    {
      code: "import { execSync } from 'node:child_process'; const A = { timeout: 0 }; execSync('tool', { ...A, timeout: 1000, ...A });",
      errors: [{ messageId: 'missingTimeout', data: { method: 'execSync' } }],
    },
    {
      code: "import { execSync } from 'node:child_process'; execSync('tool', { ['cwd']: '/tmp' });",
      errors: [{ messageId: 'missingTimeout', data: { method: 'execSync' } }],
    },
    {
      code: "import { execSync } from 'node:child_process'; execSync('tool', { timeout: 0, ['cwd']: '/tmp' });",
      errors: [{ messageId: 'missingTimeout', data: { method: 'execSync' } }],
    },
  ],
});
