import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './go-server-without-gc-target.mts';

const CHILD_PROCESS =
  "import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process';";
const EXECA_IMPORT = "import { execa } from 'execa';";

const validSnippets = [
  "spawn('tsgo', ['--api'], { env: { ...process.env, GOGC: '50' } });",
  "spawn('tsgo', ['--api'], { env: { ...process.env, GOGC: process.env.GOGC ?? '50' } });",
  "spawn('tsgo', ['--api'], { env: { ...process.env, GOMEMLIMIT: '512MiB' } });",
  "execFileSync('tsgolint', ['check'], { env: { GOGC: '50' } });",
  "const env = { ...process.env, GOGC: '50' }; spawn('tsgo', [], { env });",
  "const env = buildEnv(); spawn('tsgo', [], { env });",
  "export function start(env: NodeJS.ProcessEnv) { spawn('tsgo', [], { env }); }",
  "export function start(options: object) { spawn('tsgo', [], options); }",
  "spawn('tsgo', [], { env: { ...extraEnv } });",
  "const env = { ...process.env }; env.GOGC = '50'; spawn('tsgo', [], { env });",
  "spawn('git', ['status']);",
  "spawn('node', ['server.js']);",
  "spawn(getsGoodPath, ['--check']);",
];

const invalidCases: readonly (readonly [string, string, string?])[] = [
  ["spawn('tsgo', ['--api']);", 'spawn'],
  ["spawnSync('tsgo', ['--project', 'tsconfig.json'], { cwd: root });", 'spawnSync'],
  ["spawn('tsgo', ['--api'], { env: { ...process.env } });", 'spawn'],
  ["spawn('tsgo', ['--api'], { env: process.env });", 'spawn'],
  ["execFile('tsgolint', ['--fix'], { env: { ...process.env, NO_COLOR: '1' } });", 'execFile'],
  ["execFileSync('gopls', ['version']);", 'execFileSync'],
  ["execa('tsgo', ['--api']);", 'execa', EXECA_IMPORT],
  ["spawn('/usr/local/bin/tsgo', []);", 'spawn'],
  ["spawn('node_modules/@typescript/native-preview', ['--api']);", 'spawn'],
  ["spawn('node_modules/@typescript/native-preview-linux-x64/lib/tsc', ['--noEmit']);", 'spawn'],
  ["spawn(tsgoPath, ['--noEmit']);", 'spawn'],
  ["spawn(config.goplsBin, ['serve']);", 'spawn'],
  ["const bin = '/opt/bin/tsgolint'; execFile(bin, []);", 'execFile'],
  ["spawn(customBinary, ['--api']);", 'spawn'],
  ["const env = { ...process.env, PATH: '/bin' }; spawn('tsgo', [], { env });", 'spawn'],
  ["spawn('tsgo', ['--api'], { env: { ...process.env, GOGC: undefined } });", 'spawn'],
];

typescriptRuleTester().run('go-server-without-gc-target', rule, {
  valid: [
    ...validSnippets.map((snippet) => ({ code: `${CHILD_PROCESS} ${snippet}` })),
    { code: `${EXECA_IMPORT} execa('gopls', ['serve'], { env: { GOMEMLIMIT: '1GiB' } });` },
    { filename: 'src/runner.test.mts', code: `${CHILD_PROCESS} spawn('tsgo', ['--api']);` },
    { filename: 'tests/runner.ts', code: `${CHILD_PROCESS} spawn('tsgo', ['--api']);` },
    {
      filename: 'src/__tests__/runner.ts',
      code: `${CHILD_PROCESS} execFileSync('gopls', ['version']);`,
    },
  ],
  invalid: invalidCases.map(([snippet, method, header = CHILD_PROCESS]) => ({
    code: `${header} ${snippet}`,
    errors: [{ messageId: 'missingGoGcTarget', data: { method } }],
  })),
});
