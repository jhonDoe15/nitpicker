import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as hermeticGitInTests } from '../rules/testing/processes/hermetic-git-in-tests.mjs';
import { rule as noNodeProcessPerTest } from '../rules/testing/processes/no-node-process-per-test.mjs';
import { rule as noGitRepositoryPerTest } from '../rules/testing/processes/no-git-repository-per-test.mjs';
import { rule as noServerOrWorkerPerTest } from '../rules/testing/processes/no-server-or-worker-per-test.mjs';
import { rule as noExternalExecutables } from '../rules/testing/processes/no-external-executables-in-unit-tests.mjs';

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
// core/java-cli, core/diff/touched-code, languages/typescript/preset/fixtures/strict-clean, evals/lib/consumer).
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
ruleTester.run('unit tests remain independent of external executables', noExternalExecutables, {
  valid: [
    "import { readFile } from 'node:fs/promises';",
    'const dependency = { load: async () => value };',
  ],
  invalid: [
    {
      code: "import { execFile } from 'node:child_process';",
      errors: [{ messageId: 'externalExecutable' }],
    },
    {
      code: "const subprocess = await import('execa');",
      errors: [{ messageId: 'externalExecutable' }],
    },
    {
      code: "const subprocess = require('child_process');",
      errors: [{ messageId: 'externalExecutable' }],
    },
  ],
});
