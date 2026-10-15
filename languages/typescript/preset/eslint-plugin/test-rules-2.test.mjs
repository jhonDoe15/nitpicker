import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noProcessGlobalsOutsideMainGuard } from './rules/modules/no-process-globals-outside-main-guard.mjs';
import { rule as noRaisedTestTimeout } from './rules/testing/assertions/no-raised-test-timeout.mjs';
import { rule as noServerOrWorkerPerTest } from './rules/testing/processes/no-server-or-worker-per-test.mjs';
import { rule as testTsconfigPinsLibAndTypes } from './rules/testing/types/test-tsconfig-pins-lib-and-types.mjs';

RuleTester.afterAll = afterAll;

RuleTester.afterEach = afterEach;

RuleTester.beforeAll = beforeAll;

RuleTester.beforeEach = beforeEach;

RuleTester.describe = describe;

RuleTester.it = it;

RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

const testFile = '/repo/tests/integration/repository.test.ts';

const lines = (...parts) => parts.join('\n');

ruleTester.run('no-server-or-worker-per-test', noServerOrWorkerPerTest, {
  valid: [
    {
      filename: testFile,
      code: lines(
        "import { createServer } from 'node:http';",
        'const server = createServer(handler);',
        'beforeAll(() => new Promise((resolve) => server.listen(0, resolve)));',
        'beforeEach(() => { store.clear(); });',
        "it('reads', async () => { expect(await fetch(url)).toBeDefined(); });",
      ),
    },
    {
      filename: testFile,
      code: lines(
        "import { createServer } from '../../src/main/server.js';",
        "it('starts the app', () => { createServer(); });",
      ),
    },
    {
      filename: testFile,
      code: lines(
        "import { Worker } from 'node:worker_threads';",
        "beforeAll(() => { worker = new Worker('./server.js'); });",
      ),
    },
    {
      filename: testFile,
      code: "it('uses a web worker shape', () => { const worker = new Worker('a.js'); });",
    },
  ],
  invalid: [
    {
      filename: '/repo/tests/integration/cache-stores.test.ts',
      code: lines(
        "import { Worker } from 'node:worker_threads';",
        "function startTestHttpServer() { return new Worker(new URL('./server.mjs', import.meta.url)); }",
        'async function server() { const started = await startTestHttpServer(); cleanups.push(() => started.terminate()); return started; }',
        "it('stores and returns text', async () => { const remote = await server(); expect(remote).toBeDefined(); });",
      ),
      errors: [{ messageId: 'serverPerTest', line: 2 }],
    },
    {
      filename: testFile,
      code: lines(
        "import http from 'node:http';",
        "import * as net from 'net';",
        'beforeEach(() => { server = http.createServer(handler); });',
        "it('connects', () => { const socketServer = net.createServer(); });",
        "it('constructs', () => { const raw = new net.Server(); });",
      ),
      errors: [
        { messageId: 'serverPerTest', line: 3 },
        { messageId: 'serverPerTest', line: 4 },
        { messageId: 'serverPerTest', line: 5 },
      ],
    },
  ],
});
ruleTester.run('no-raised-test-timeout', noRaisedTestTimeout, {
  valid: [
    { filename: testFile, code: "it('runs', () => {});" },
    { filename: testFile, code: "it('runs', () => {}, 10_000);" },
    { filename: testFile, code: "const LIMIT = 5 * 1000; test('runs', async () => {}, LIMIT);" },
    { filename: testFile, code: "it('retries', { retry: 2 }, () => {});" },
    { filename: testFile, code: "it.each([1, 2])('case %s', () => {}, 2000);" },
    { filename: testFile, code: 'beforeAll(() => setup(), 10_000);' },
    { filename: testFile, code: "describe('suite', () => { it('runs', () => {}); });" },
    { filename: testFile, code: 'setTimeout(() => done(), 60_000);' },
    {
      filename: testFile,
      code: 'vi.setConfig({ testTimeout: 5000, sequence: { shuffle: true } });',
    },
  ],
  invalid: [
    {
      filename: '/repo/tests/integration/strict-clean.test.ts',
      code: lines(
        'const FIXTURE_TIMEOUT_MS = 300_000;',
        "it('passes --all', () => { run(); }, FIXTURE_TIMEOUT_MS);",
      ),
      errors: [{ messageId: 'raisedTimeout', line: 2 }],
    },
    {
      filename: '/repo/tests/integration/eslint-diff-policy.test.ts',
      code: lines(
        "it('compares', () => {}, 60_000);",
        "it('compares typed', async () => {}, 120_000);",
      ),
      errors: [{ messageId: 'raisedTimeout' }, { messageId: 'raisedTimeout' }],
    },
    {
      filename: testFile,
      code: lines(
        "it('object form', { timeout: 60_000 }, () => {});",
        "describe('suite', { timeout: 20_000 }, () => {});",
        'beforeAll(async () => setup(), 5 * 60 * 1000);',
        'vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });',
        "it.concurrent('fast?', async () => {}, 11_000);",
      ),
      errors: [
        { messageId: 'raisedTimeout', line: 1 },
        { messageId: 'raisedTimeout', line: 2 },
        { messageId: 'raisedTimeout', line: 3 },
        { messageId: 'raisedTimeout', line: 4 },
        { messageId: 'raisedTimeout', line: 4 },
        { messageId: 'raisedTimeout', line: 5 },
      ],
    },
    {
      filename: testFile,
      code: "it('computed', () => {}, Number(process.env.SLOW_TIMEOUT));",
      errors: [{ messageId: 'unknownTimeout' }],
    },
  ],
});
ruleTester.run('no-process-globals-outside-main-guard', noProcessGlobalsOutsideMainGuard, {
  valid: [
    {
      filename: '/repo/tests/fixtures/fake-analyzer.ts',
      code: lines(
        'export function main(argv) { return argv.length === 0 ? 2 : 0; }',
        'if (import.meta.main) { process.exitCode = main(process.argv.slice(2)); }',
      ),
    },
    {
      filename: '/repo/tests/fixtures/fake-analyzer.ts',
      code: lines(
        "import { pathToFileURL } from 'node:url';",
        'export function main(argv) { return 0; }',
        'if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));',
      ),
    },
    {
      filename: '/repo/tests/fixtures/fake-analyzer.cjs',
      code: 'if (require.main === module) { process.exit(run(process.argv.slice(2))); }',
    },
    {
      filename: '/repo/tests/fixtures/environment.ts',
      code: 'export const home = process.env.HOME; process.stdout.write("x");',
    },
  ],
  invalid: [
    {
      filename: '/repo/tests/fixtures/fake-analyzer.ts',
      code: lines(
        'const arguments_ = parseArguments(process.argv.slice(2));',
        "if (policy.mode === 'crash') {",
        "  process.stderr.write('fake analyzer crash');",
        '  process.exit(2);',
        '}',
        'if (findings.length > 0) process.exitCode = 1;',
      ),
      errors: [
        { messageId: 'processGlobalOutsideGuard', line: 1, data: { member: 'argv' } },
        { messageId: 'processGlobalOutsideGuard', line: 4, data: { member: 'exit' } },
        { messageId: 'processGlobalOutsideGuard', line: 6, data: { member: 'exitCode' } },
      ],
    },
    {
      filename: '/repo/tests/fixtures/policy-probe-runner.ts',
      code: 'const [root, logPath] = process.argv.slice(2);',
      errors: [{ messageId: 'processGlobalOutsideGuard' }],
    },
    {
      filename: '/repo/tests/fixtures/cli.ts',
      code: 'export function main(argv = process.argv.slice(2)) { return argv.length; }',
      errors: [{ messageId: 'processGlobalOutsideGuard' }],
    },
  ],
});
ruleTester.run('test-tsconfig-pins-lib-and-types', testTsconfigPinsLibAndTypes, {
  valid: [
    {
      filename: testFile,
      code: "writeFileSync(file, JSON.stringify({ compilerOptions: { strict: true, lib: ['ES2022'], types: [] } }));",
    },
    {
      filename: testFile,
      code: 'const tsconfig = { compilerOptions: { noLib: true, types: [] } }; writeFileSync(file, JSON.stringify(tsconfig));',
    },
    {
      filename: testFile,
      code: lines(
        "const pinned = { lib: ['ES2022'], types: [] };",
        'writeFileSync(file, JSON.stringify({ compilerOptions: { ...pinned, strict: true } }));',
      ),
    },
    {
      filename: testFile,
      code: "import { base } from './base.js'; JSON.stringify({ compilerOptions: { ...base } });",
    },
    {
      filename: testFile,
      code: "writeFileSync(file, JSON.stringify({ name: 'fixture', private: true }));",
    },
  ],
  invalid: [
    {
      filename: '/repo/tests/integration/strict-adapters.test.ts',
      code: lines(
        'writeFileSync(',
        "  path.join(root, 'tsconfig.json'),",
        '  JSON.stringify({',
        "    compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', lib: ['ES2022'] },",
        "    include: ['src/**/*'],",
        '  }),',
        ');',
      ),
      errors: [{ messageId: 'unpinnedTsconfig', line: 4 }],
    },
    {
      filename: '/repo/tests/integration/static-checks-diff-policy.test.ts',
      code: lines(
        'const typeScriptConfig = JSON.stringify({',
        "  compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true },",
        "  include: ['src/**/*.ts'],",
        '});',
        "writeFiles(projectRoot, { 'tsconfig.json': `${typeScriptConfig}\\n` });",
      ),
      errors: [{ messageId: 'unpinnedTsconfig', line: 2 }],
    },
    {
      filename: testFile,
      code: 'const tsconfig = { compilerOptions: { types: [] } }; writeFileSync(file, JSON.stringify(tsconfig, undefined, 2));',
      errors: [{ messageId: 'unpinnedTsconfig' }],
    },
  ],
});
