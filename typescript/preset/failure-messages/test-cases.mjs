import strictTestsConfig from '../eslint-config/strict-tests.mjs';

const testFile = 'test/integration/repository.test.ts';
const childProcess = "import { execFileSync, spawnSync } from 'node:child_process';\n";

function testCase(name, banned, allowed, filename = testFile) {
  return { name, config: strictTestsConfig, filename, banned, allowed };
}

// One case per banned form of the strict test rules (preset/eslint-config/strict-tests.mjs).
export const testFailureMessageCases = [
  testCase(
    'git init per test names a beforeAll template copied with cpSync',
    `${childProcess}it('x', () => { execFileSync('git', ['init', '-q'], { env: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }); });`,
    'copy it per test with cpSync',
  ),
  testCase(
    'non-hermetic git names GIT_CONFIG_GLOBAL',
    `${childProcess}execFileSync('git', ['commit', '-m', 'base'], { cwd: root });`,
    'GIT_CONFIG_GLOBAL',
  ),
  testCase(
    'node process per test names importing the function',
    `${childProcess}it('x', () => { spawnSync(process.execPath, ['cli.js']); });`,
    'Import the function and call it in-process',
  ),
  testCase(
    'server per test names beforeAll',
    "import { createServer } from 'node:http';\nit('x', () => { createServer(handler); });",
    'Start it once in beforeAll',
  ),
  testCase(
    'raised test timeout names making the test faster',
    "it('x', () => {}, 300_000);",
    'Make the test faster',
  ),
  testCase(
    'computed test timeout names a number written in the file',
    "it('x', () => {}, Number(process.env.T));",
    'number of at most 10000 ms',
  ),
  testCase(
    'unpinned test tsconfig names types and lib',
    'writeFileSync(file, JSON.stringify({ compilerOptions: { strict: true } }));',
    "types: [] and lib: ['ES2022']",
  ),
  testCase(
    'fixture script argv names the main guard',
    'const [root] = process.argv.slice(2);',
    'only inside a main guard',
    'test/fixtures/fake-cli.ts',
  ),
];
