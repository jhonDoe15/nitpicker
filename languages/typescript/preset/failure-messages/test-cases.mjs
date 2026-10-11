import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { strictProductionRules } from '../eslint-config/strict.mjs';
import strictTestsConfig from '../eslint-config/strict-tests.mjs';

const productionRulesConfig = [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: strictProductionRules,
  },
];

const partialAssertionConfig = [
  {
    files: ['test/**/*.test.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: { 'nitpicker/no-partial-output-assertion': 'error' },
  },
];

const testFile = 'test/integration/repository.test.ts';
const childProcess = "import { execFileSync, spawnSync } from 'node:child_process';\n";

function testCase(name, banned, allowed, filename = testFile) {
  return { name, config: strictTestsConfig, filename, banned, allowed };
}

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
    'first-test-charged setup names beforeAll and the exception path',
    "let built;\nasync function build() { built ??= await compile(); return built; }\nit('x', async () => { await build(); });",
    'Compute it once in beforeAll',
  ),
  testCase(
    'first-test-charged setup names nitpicker.config.json',
    "let cache;\nfunction load() { if (!cache) cache = readAll(); return cache; }\nit('x', () => { load(); });",
    'exception for this rule in nitpicker.config.json',
  ),
  {
    name: 'uninjectable delay names the option with the constant as its default',
    config: productionRulesConfig,
    filename: 'src/service.ts',
    banned:
      'const KILL_DELAY_MS = 1_000;\nexport function stop() { setTimeout(kill, KILL_DELAY_MS); }',
    allowed: 'Accept the delay as an option with KILL_DELAY_MS as its default',
  },
  {
    name: 'uninjectable delay names nitpicker.config.json',
    config: productionRulesConfig,
    filename: 'src/service.ts',
    banned:
      'const KILL_DELAY_MS = 1_000;\nexport function stop() { setTimeout(kill, KILL_DELAY_MS); }',
    allowed: 'exception for this rule in nitpicker.config.json',
  },
  {
    name: 'z.unknown() object field names validating the field in the schema',
    config: productionRulesConfig,
    filename: 'src/service.ts',
    banned: "import { z } from 'zod';\nexport const schema = z.object({ name: z.unknown() });",
    allowed: 'z.string().trim().min(1)',
  },
  {
    name: 'z.any() object field names z.email()',
    config: productionRulesConfig,
    filename: 'src/service.ts',
    banned: "import { z } from 'zod';\nexport const schema = z.object({ email: z.any() });",
    allowed: 'z.email()',
  },
  {
    name: 'partial output assertion names toEqual',
    config: partialAssertionConfig,
    filename: testFile,
    banned: "it('x', () => { expect(render()).toContain('total: 3'); });",
    allowed: 'toEqual',
  },
  {
    name: 'partial output assertion names nitpicker.config.json',
    config: partialAssertionConfig,
    filename: testFile,
    banned: "it('x', () => { expect(render()).toContain('total: 3'); });",
    allowed: 'exception for this rule in nitpicker.config.json',
  },
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
