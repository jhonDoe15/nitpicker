import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import hermeticGitInTests from './rules/hermetic-git-in-tests.mjs';
import noFirstTestChargedSetup from './rules/no-first-test-charged-setup.mjs';
import noUninjectableDelay from './rules/no-uninjectable-delay.mjs';
import noGitRepositoryPerTest from './rules/no-git-repository-per-test.mjs';
import noNodeProcessPerTest from './rules/no-node-process-per-test.mjs';
import noProcessGlobalsOutsideMainGuard from './rules/no-process-globals-outside-main-guard.mjs';
import noRaisedTestTimeout from './rules/no-raised-test-timeout.mjs';
import noServerOrWorkerPerTest from './rules/no-server-or-worker-per-test.mjs';
import testTsconfigPinsLibAndTypes from './rules/test-tsconfig-pins-lib-and-types.mjs';

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
const childProcess =
  "import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';";

// Shapes taken from nitpicker's own suite before the 2026-10-09 speed-up (core/diff/diff-policy,
// core/java-cli, core/diff/touched-code, preset/fixtures/strict-clean, evals/lib/consumer).
const diffPolicyRepository = lines(
  childProcess,
  "it('compares', () => { const repository = createRepository({ 'a.ts': '' }); expect(repository).toBeDefined(); });",
  'function createRepository(files) {',
  "  const root = mkdtempSync('/tmp/repo-');",
  "  git(root, ['init', '-q', '--initial-branch=main']);",
  "  git(root, ['config', 'user.name', 'Fixture']);",
  '  commit(root, "base");',
  '  return { root };',
  '}',
  "function commit(root, message) { git(root, ['add', '-A']); git(root, ['commit', '-q', '-m', message]); }",
  "function git(root, arguments_) { return execFileSync('git', arguments_, { cwd: root, encoding: 'utf8' }); }",
);
const touchedCodeInline = lines(
  childProcess,
  "it('reads real git output', () => {",
  "  const run = (...args) => execFileSync('git', ['-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' }).trim();",
  "  run('init', '-q', '-b', 'main');",
  "  run('commit', '-q', '-m', 'base');",
  '});',
);
const strictCleanProject = lines(
  childProcess,
  "function git(root, ...args) { execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=f@example.invalid', ...args], { cwd: root }); }",
  "function createProject() { const root = mkdtempSync('/tmp/x-'); git(root, 'init', '-q', '-b', 'main'); git(root, 'add', '-A'); return root; }",
  "it('passes', () => { runSnapshot(createProject()); });",
);
const consumerChecked = lines(
  childProcess,
  "function checked(root, command, args) { return execFileSync(command, args, { cwd: root, encoding: 'utf8' }); }",
  "beforeEach(() => { checked(root, 'git', ['init', '-b', 'main']); });",
);
const hermeticEnvironment =
  "{ ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }";

ruleTester.run('no-git-repository-per-test', noGitRepositoryPerTest, {
  valid: [
    {
      filename: testFile,
      code: lines(
        childProcess,
        "import { cpSync } from 'node:fs';",
        "beforeAll(() => { execFileSync('git', ['init', '-q', template]); });",
        "it('copies the template', () => { cpSync(template, root, { recursive: true }); });",
      ),
    },
    {
      filename: testFile,
      code: lines(
        childProcess,
        "function createTemplate() { execFileSync('git', ['init', '-q'], { cwd: template }); }",
        'beforeAll(createTemplate);',
        "it('reads status', () => { execFileSync('git', ['status'], { cwd: root }); });",
      ),
    },
    {
      filename: testFile,
      code: lines(
        "import { createRepository } from '../fixtures/git-repository.js';",
        "it('uses the shared helper', () => { createRepository(); });",
      ),
    },
    {
      filename: testFile,
      code: "it('names init in a message', () => { expect(run('init')).toBe(1); });",
    },
    {
      filename: testFile,
      code: lines(childProcess, "afterEach(() => { execFileSync('git', ['init', '-q']); });"),
    },
  ],
  invalid: [
    {
      filename: testFile,
      code: diffPolicyRepository,
      errors: [{ messageId: 'repositoryPerTest', line: 5 }],
    },
    { filename: testFile, code: touchedCodeInline, errors: [{ messageId: 'repositoryPerTest' }] },
    { filename: testFile, code: strictCleanProject, errors: [{ messageId: 'repositoryPerTest' }] },
    { filename: testFile, code: consumerChecked, errors: [{ messageId: 'repositoryPerTest' }] },
    {
      filename: testFile,
      code: lines(childProcess, "it('inits', () => { execSync('git init -q repo'); });"),
      errors: [{ messageId: 'repositoryPerTest' }],
    },
    {
      filename: testFile,
      code: lines(
        "import * as cp from 'node:child_process';",
        "it.each([1, 2])('case %s', () => { cp.spawnSync('git', ['-C', root, 'clone', source]); });",
      ),
      errors: [{ messageId: 'repositoryPerTest' }],
    },
    {
      filename: testFile,
      code: lines(
        "const { execFileSync } = require('child_process');",
        "test('inits', () => { execFileSync('git', ['init']); });",
        "test('inits again', () => { execFileSync('git', ['status']); });",
      ),
      errors: [{ messageId: 'repositoryPerTest' }],
    },
  ],
});

ruleTester.run('hermetic-git-in-tests', hermeticGitInTests, {
  valid: [
    {
      filename: testFile,
      code: lines(
        childProcess,
        `execFileSync('git', ['commit', '-m', 'x'], { cwd: root, env: ${hermeticEnvironment} });`,
      ),
    },
    {
      filename: testFile,
      code: lines(
        childProcess,
        `const gitEnvironment = ${hermeticEnvironment};`,
        "function git(root, args) { return execFileSync('git', args, { cwd: root, env: gitEnvironment }); }",
        "git(root, ['commit', '-q', '-m', 'base']);",
      ),
    },
    {
      filename: testFile,
      code: lines(
        childProcess,
        "const hermetic = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };",
        "const options = { cwd: root, env: { ...process.env, ...hermetic, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z' } };",
        "spawnSync('git', ['init'], options);",
      ),
    },
    {
      filename: testFile,
      code: lines(childProcess, "execFileSync('npm', ['--version']);"),
    },
    {
      filename: testFile,
      code: "import { git } from '../fixtures/git.js'; git(root, ['commit']);",
    },
  ],
  invalid: [
    {
      filename: testFile,
      code: diffPolicyRepository,
      errors: [{ messageId: 'nonHermeticGit', line: 11 }],
    },
    { filename: testFile, code: strictCleanProject, errors: [{ messageId: 'nonHermeticGit' }] },
    {
      filename: testFile,
      code: consumerChecked,
      errors: [{ messageId: 'nonHermeticGit', line: 2 }],
    },
    {
      filename: testFile,
      code: lines(
        childProcess,
        "execFileSync('git', ['commit', '-m', 'x'], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } });",
      ),
      errors: [{ messageId: 'nonHermeticGit' }],
    },
    {
      filename: testFile,
      code: lines(
        childProcess,
        "import { gitEnvironment } from '../fixtures/git.js';",
        "execFileSync('git', ['commit'], { env: gitEnvironment });",
      ),
      errors: [{ messageId: 'nonHermeticGit' }],
    },
    {
      filename: '/repo/tests/fixtures/git-repository.ts',
      code: lines(childProcess, "execSync('git commit -qm base', { cwd: root });"),
      errors: [{ messageId: 'nonHermeticGit' }],
    },
  ],
});

ruleTester.run('no-node-process-per-test', noNodeProcessPerTest, {
  valid: [
    {
      filename: testFile,
      code: lines(
        "import { cruise } from 'dependency-cruiser';",
        "it('cruises in-process', async () => { expect(await cruise([fixture])).toBeDefined(); });",
      ),
    },
    {
      filename: testFile,
      code: lines(
        "import { AppProcess } from '../fixtures/app-process.js';",
        "it('exits 2 on bad input', async () => { expect((await AppProcess.run(['--bad'])).code).toBe(2); });",
      ),
    },
    {
      filename: testFile,
      code: lines(
        childProcess,
        'let output;',
        "beforeAll(() => { output = spawnSync(process.execPath, [cli, '--all']); });",
        "it('prints a summary', () => { expect(String(output.stdout)).toContain('0'); });",
      ),
    },
    {
      filename: testFile,
      code: "it('declares an invocation', () => { expect({ command: process.execPath, args: [] }).toBeDefined(); });",
    },
    {
      filename: '/repo/tests/fixtures/app-process.ts',
      code: lines(
        childProcess,
        "export function run(args) { return spawnSync(process.execPath, ['dist/main.js', ...args]); }",
      ),
    },
  ],
  invalid: [
    {
      filename: '/repo/tests/integration/strict-boundary-rules.test.ts',
      code: lines(
        "import { spawnSync } from 'node:child_process';",
        "const dependencyCruiser = path.join(projectRoot, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs');",
        'function cruiseFixture(name) {',
        "  return spawnSync(process.execPath, [dependencyCruiser, name, '--output-type', 'err-long'], { encoding: 'utf8' });",
        '}',
        "it.each(violations)('%s', (name) => { expect(cruiseFixture(name).status).toBe(1); });",
      ),
      errors: [{ messageId: 'nodeProcessPerTest', line: 4 }],
    },
    {
      filename: '/repo/tests/integration/layout-configs.test.ts',
      code: lines(
        "import { execFileSync } from 'node:child_process';",
        "function runWithPolicy(arguments_, policy) { return JSON.parse(execFileSync(process.execPath, arguments_, { encoding: 'utf8' })); }",
        "function importDefault(relativePath, policy) { return runWithPolicy(['--input-type=module', '-e', relativePath], policy); }",
        "it('reads the policy', () => { expect(importDefault('a.mjs', {})).toEqual({}); });",
      ),
      errors: [{ messageId: 'nodeProcessPerTest' }],
    },
    {
      filename: testFile,
      code: lines(
        childProcess,
        "it('lints', () => { execFileSync(path.join(root, 'node_modules/.bin/eslint'), ['.']); });",
        "it('compiles', () => { execSync('npx tsc --noEmit'); });",
        "beforeEach(() => { fork('./worker.js'); });",
        "test('runs', () => { const node = 'node'; spawnSync(node, ['main.js']); });",
      ),
      errors: [
        { messageId: 'nodeProcessPerTest', line: 2 },
        { messageId: 'nodeProcessPerTest', line: 3 },
        { messageId: 'nodeProcessPerTest', line: 4 },
        { messageId: 'nodeProcessPerTest', line: 5 },
      ],
    },
    {
      filename: testFile,
      code: lines(
        "import { execa } from 'execa';",
        "it('runs the bin', async () => { await execa(process.execPath, ['bin/cli.js']); });",
      ),
      errors: [{ messageId: 'nodeProcessPerTest' }],
    },
  ],
});

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

ruleTester.run('no-first-test-charged-setup', noFirstTestChargedSetup, {
  valid: [
    {
      filename: testFile,
      code: lines(
        'let built;',
        'beforeAll(async () => { built = await compile(); });',
        "it('x', () => use(built));",
      ),
    },
    {
      filename: testFile,
      code: lines(
        'let built;',
        'beforeAll(() => { built ??= compile(); });',
        "it('x', () => use(built));",
      ),
    },
    {
      filename: testFile,
      code: lines('let n;', 'function pick() { n ??= 5; return n; }', "it('x', () => pick());"),
    },
    {
      filename: testFile,
      code: lines(
        'let key;',
        'function keyOf() { key ??= path.join(root, "a"); return key; }',
        "it('x', () => keyOf());",
      ),
    },
    {
      filename: testFile,
      code: lines(
        'function fresh() { let local; local ??= compile(); return local; }',
        "it('x', () => fresh());",
      ),
    },
    {
      filename: testFile,
      code: lines('let built;', 'function unused() { built ??= compile(); }', "it('x', () => {});"),
    },
    {
      filename: testFile,
      code: lines(
        'let built;',
        'function load() { if (other) built = compile(); return built; }',
        "it('x', () => load());",
      ),
    },
    {
      filename: testFile,
      code: lines('let value;', "it('x', () => { value = compile(); });"),
    },
  ],
  invalid: [
    {
      filename: testFile,
      code: lines(
        'let built;',
        'async function build() { built ??= await compile(); return built; }',
        "it('x', async () => { await build(); });",
      ),
      errors: [{ messageId: 'chargedSetup', data: { name: 'built' }, line: 2 }],
    },
    {
      filename: testFile,
      code: lines(
        'let cache;',
        'function load() { if (!cache) cache = readAll(); return cache; }',
        "test('x', () => { load(); });",
      ),
      errors: [{ messageId: 'chargedSetup', line: 2 }],
    },
    {
      filename: testFile,
      code: lines(
        'let cache;',
        'function load() { if (cache === undefined) { cache = run(); } return cache; }',
        'beforeEach(() => { load(); });',
      ),
      errors: [{ messageId: 'chargedSetup', line: 2 }],
    },
    {
      filename: testFile,
      code: lines(
        'var repo = undefined;',
        'function get() { if (repo) return repo; repo = makeRepo(); return repo; }',
        "it.each([1, 2])('x %s', () => { get(); });",
      ),
      errors: [{ messageId: 'chargedSetup', line: 2 }],
    },
    {
      filename: testFile,
      code: lines(
        'let fixture;',
        'function get() { fixture = fixture ?? build(); return fixture; }',
        "it('x', () => { get(); });",
      ),
      errors: [{ messageId: 'chargedSetup', line: 2 }],
    },
    {
      filename: testFile,
      code: lines('let shared;', "it('x', () => { shared ||= prepare(); });"),
      errors: [{ messageId: 'chargedSetup', line: 2 }],
    },
  ],
});

const sourceFile = '/repo/src/service.ts';

ruleTester.run('no-uninjectable-delay', noUninjectableDelay, {
  valid: [
    {
      filename: sourceFile,
      code: lines(
        'const DELAY_MS = 1_000;',
        'export function stop({ delayMs = DELAY_MS } = {}) { setTimeout(kill, delayMs); }',
      ),
    },
    {
      filename: sourceFile,
      code: lines(
        'const DELAY_MS = 1_000;',
        'export function stop(options) { setTimeout(kill, DELAY_MS); }',
      ),
    },
    {
      filename: sourceFile,
      code: lines(
        'const DELAY_MS = 100;',
        'export function stop() { setTimeout(kill, DELAY_MS); }',
      ),
    },
    {
      filename: sourceFile,
      code: 'export function stop() { setTimeout(kill, 5_000); }',
    },
    {
      filename: sourceFile,
      code: lines('const DELAY_MS = 1_000;', 'function stop() { setTimeout(kill, DELAY_MS); }'),
    },
    {
      filename: sourceFile,
      code: lines(
        'const DELAY_MS = 1_000;',
        'export function stop() { const setTimeout = fake; setTimeout(kill, DELAY_MS); }',
      ),
    },
    {
      filename: sourceFile,
      code: lines(
        'const DELAY_MS = 1_000;',
        'export function stop() { run(() => other(DELAY_MS)); }',
      ),
    },
    {
      filename: sourceFile,
      code: lines('export function stop() { const DELAY_MS = 1_000; setTimeout(kill, DELAY_MS); }'),
    },
    {
      filename: sourceFile,
      code: lines(
        "import { setTimeout as sleep } from 'node:timers/promises';",
        'const DELAY_MS = 1_000;',
        'export async function wait(options) { await sleep(DELAY_MS); }',
      ),
    },
    {
      filename: sourceFile,
      code: lines(
        'const DELAY_MS = 1_000;',
        'export const stop = (config) => setTimeout(kill, DELAY_MS);',
      ),
    },
  ],
  invalid: [
    {
      filename: sourceFile,
      code: lines(
        'const DELAY_MS = 1_000;',
        'export function stop() { setTimeout(kill, DELAY_MS); }',
      ),
      errors: [
        {
          messageId: 'uninjectableDelay',
          data: { timer: 'setTimeout', name: 'DELAY_MS', value: '1000', owner: 'stop' },
          line: 2,
        },
      ],
    },
    {
      filename: sourceFile,
      code: lines(
        'const POLL_MS = 500;',
        'export const watch = (child) => { return setInterval(() => poll(child), POLL_MS); };',
      ),
      errors: [{ messageId: 'uninjectableDelay', line: 2 }],
    },
    {
      filename: sourceFile,
      code: lines(
        'const DELAY_MS = 2 * 1000;',
        'function stop(child) { child.on("close", () => { setTimeout(() => kill(child), DELAY_MS).unref(); }); }',
        'export { stop };',
      ),
      errors: [{ messageId: 'uninjectableDelay', line: 2 }],
    },
    {
      filename: sourceFile,
      code: lines(
        "import { setTimeout as sleep } from 'node:timers/promises';",
        'const SETTLE_MS = 750;',
        'export async function settle(handle) { await sleep(SETTLE_MS); return handle; }',
      ),
      errors: [
        {
          messageId: 'uninjectableDelay',
          data: { timer: 'setTimeout', name: 'SETTLE_MS', value: '750', owner: 'settle' },
          line: 3,
        },
      ],
    },
    {
      filename: sourceFile,
      code: lines(
        "import timers from 'node:timers/promises';",
        'const SETTLE_MS = 750;',
        'export default async function () { await timers.setTimeout(SETTLE_MS); }',
      ),
      errors: [
        {
          messageId: 'uninjectableDelay',
          data: { timer: 'setTimeout', name: 'SETTLE_MS', value: '750', owner: 'default' },
          line: 3,
        },
      ],
    },
    {
      filename: sourceFile,
      code: lines(
        'const BASE_MS = 400;',
        'export function stop() { globalThis.setTimeout(kill, BASE_MS * 2); }',
      ),
      errors: [
        {
          messageId: 'uninjectableDelay',
          data: { timer: 'setTimeout', name: 'BASE_MS', value: '800', owner: 'stop' },
          line: 2,
        },
      ],
    },
  ],
});
