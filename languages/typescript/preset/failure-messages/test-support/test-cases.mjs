import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { strictProductionRules } from '../../eslint-config/strict.mjs';
import { strictTestsConfig } from '../../eslint-config/strict-tests.mjs';

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

const testFile = 'test/repository.test.ts';
const childProcess = "import { execFileSync, spawnSync } from 'node:child_process';\n";

function testCase({ name, banned, allowed, filename = testFile }) {
  return { name, config: strictTestsConfig, filename, banned, allowed };
}

export const testFailureMessageCases = [
  testCase({
    name: 'git init per test names a beforeAll template copied with cpSync',
    banned: `${childProcess}it('x', () => { execFileSync('git', ['init', '-q'], { env: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }); });`,
    allowed: 'copy it per test with cpSync',
  }),
  testCase({
    name: 'non-hermetic git names GIT_CONFIG_GLOBAL',
    banned: `${childProcess}execFileSync('git', ['commit', '-m', 'base'], { cwd: root });`,
    allowed: 'GIT_CONFIG_GLOBAL',
  }),
  testCase({
    name: 'node process per test names importing the function',
    banned: `${childProcess}it('x', () => { spawnSync(process.execPath, ['cli.js']); });`,
    allowed: 'Import the function and call it in-process',
  }),
  testCase({
    name: 'server per test names beforeAll',
    banned: "import { createServer } from 'node:http';\nit('x', () => { createServer(handler); });",
    allowed: 'Start it once in beforeAll',
  }),
  testCase({
    name: 'raised test timeout names making the test faster',
    banned: "it('x', () => {}, 300_000);",
    allowed: 'Make the test faster',
  }),
  testCase({
    name: 'computed test timeout names a number written in the file',
    banned: "it('x', () => {}, Number(process.env.T));",
    allowed: 'number between 1 and 10000 ms written in this file',
  }),
  testCase({
    name: 'test retry names fixing the flaky cause',
    banned: "it('x', { retry: 2 }, () => {});",
    allowed: 'Fix the cause, such as waiting on the condition instead of a delay',
  }),
  testCase({
    name: 'copied production constant names using the constant',
    banned:
      "import { JAVASCRIPT_PRESET_FILE } from '../../languages/typescript/preset/checks/policy-files.mjs';\nit('x', () => { expect(read()).toBe('languages/javascript/preset/javascript-preset.mjs'); });",
    allowed: 'Use JAVASCRIPT_PRESET_FILE',
  }),
  testCase({
    name: 'first-test-charged setup names beforeAll and the exception path',
    banned:
      "let built;\nasync function build() { built ??= await compile(); return built; }\nit('x', async () => { await build(); });",
    allowed: 'Compute it once in beforeAll',
  }),
  testCase({
    name: 'first-test-charged setup names when an exception fits',
    banned:
      "let cache;\nfunction load() { if (!cache) cache = readAll(); return cache; }\nit('x', () => { load(); });",
    allowed: 'An exception fits only when the setup is cheap',
  }),
  {
    name: 'uninjectable delay names the option with the constant as its default',
    config: productionRulesConfig,
    filename: 'src/service.ts',
    banned:
      'const KILL_DELAY_MS = 1_000;\nexport function stop() { setTimeout(kill, KILL_DELAY_MS); }',
    allowed: 'Accept the delay as an option with KILL_DELAY_MS as its default',
  },
  {
    name: 'uninjectable delay names when an exception fits',
    config: productionRulesConfig,
    filename: 'src/service.ts',
    banned:
      'const KILL_DELAY_MS = 1_000;\nexport function stop() { setTimeout(kill, KILL_DELAY_MS); }',
    allowed: 'An exception fits only when the delay is deliberately fixed',
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
  ...[
    ['props', 'export type PanelProps = { tag?: string; tags?: string[] };'],
    ['parameters', 'export function send(recipient?: string, recipients?: string[]) {}'],
    ['options', 'export function send(options: { recipient?: string; recipients?: string[] }) {}'],
    [
      'schema entries',
      "import { z } from 'zod';\nexport const Query = z.object({ tag: z.string().optional(), tags: z.array(z.string()).optional() });",
    ],
  ].map(([kind, banned]) => ({
    name: `singular and plural ${kind} name the one-element array`,
    config: productionRulesConfig,
    filename: 'src/service.ts',
    banned,
    allowed: 'pass a single item as a one-element array',
  })),
  {
    name: 'v.any() object field names the valibot pipe that validates it',
    config: productionRulesConfig,
    filename: 'src/service.ts',
    banned: "import * as v from 'valibot';\nexport const schema = v.object({ email: v.any() });",
    allowed: 'v.pipe(v.string(), v.email())',
  },
  {
    name: 'Joi .unknown() names Joi.object as it is',
    config: productionRulesConfig,
    filename: 'src/service.ts',
    banned:
      "import Joi from 'joi';\nexport const schema = Joi.object({ a: Joi.string() }).unknown();",
    allowed: 'Joi.object({...}) as it is, which rejects unknown keys',
  },
  {
    name: 'additionalProperties: true in an ajv schema names additionalProperties: false',
    config: productionRulesConfig,
    filename: 'src/service.ts',
    banned:
      "import Ajv from 'ajv';\nconst ajv = new Ajv();\nexport const check = ajv.compile({ type: 'object', additionalProperties: true });",
    allowed: 'additionalProperties: false, which rejects unknown keys',
  },
  {
    name: 'eager TypeORM relation names loading it per query',
    config: productionRulesConfig,
    filename: 'src/orders/order.entity.ts',
    banned:
      "import { ManyToOne } from 'typeorm';\nexport class Order { @ManyToOne(() => Customer, { eager: true }) customer: Customer; }",
    allowed: 'relations: { customer: true }',
  },
  {
    name: 'unordered page names the order on a unique key',
    config: productionRulesConfig,
    filename: 'src/assets/asset.repository.ts',
    banned:
      "import { Kysely } from 'kysely';\nexport const list = (db: Kysely<DB>) => db.selectFrom('asset').selectAll().limit(20).execute();",
    allowed: ".orderBy('createdAt', 'desc').orderBy('id')",
  },
  {
    name: 'runtime array in an in list names the any() parameter',
    config: productionRulesConfig,
    filename: 'src/assets/asset.repository.ts',
    banned:
      "import { Kysely } from 'kysely';\nexport const byIds = (db: Kysely<DB>, ids: string[]) => db.selectFrom('asset').selectAll().where('id', 'in', ids).execute();",
    allowed: '::uuid[])',
  },
  {
    name: 'many-to-many cascade remove names the persist-only cascade',
    config: productionRulesConfig,
    filename: 'src/posts/post.entity.ts',
    banned:
      "import { ManyToMany } from 'typeorm';\nexport class Post { @ManyToMany(() => Tag, { cascade: true }) tags: Tag[]; }",
    allowed: "Cascade only ['insert', 'update']",
  },
  {
    name: 'partial output assertion names toEqual',
    config: partialAssertionConfig,
    filename: testFile,
    banned: "it('x', () => { expect(render()).toContain('total: 3'); });",
    allowed: 'toEqual',
  },
  {
    name: 'partial output assertion names when an exception fits',
    config: partialAssertionConfig,
    filename: testFile,
    banned: "it('x', () => { expect(render()).toContain('total: 3'); });",
    allowed: 'An exception fits only when the output is too large',
  },
  {
    name: 'partial matcher names toEqual with the whole value',
    config: partialAssertionConfig,
    filename: testFile,
    banned: "it('x', () => { expect(send()).toMatchObject({ channel: 'email' }); });",
    allowed: 'Pass the whole expected value to `toEqual`',
  },
  {
    name: 'partial matcher names expect.any for varying fields',
    config: partialAssertionConfig,
    filename: testFile,
    banned: "it('x', () => { expect(send()).toEqual({ id: expect.stringContaining('n-') }); });",
    allowed: 'expect.any(Type)',
  },
  {
    name: 'partial matcher names when an exception fits',
    config: partialAssertionConfig,
    filename: testFile,
    banned: "it('x', () => { expect(send()).toEqual(expect.objectContaining({ a: 1 })); });",
    allowed: 'An exception fits only when the value is too large',
  },
  testCase({
    name: 'loop in a test names it.each',
    banned: "it('x', () => { for (let index = 0; index < 3; index += 1) { run(index); } });",
    allowed: 'it.each',
  }),
  testCase({
    name: 'as in a test names narrowing',
    banned: 'const name = lookup() as string;',
    allowed: 'Narrow the value',
  }),
  testCase({
    name: '.then in a test names async/await',
    banned: "it('x', async () => { await run().then(check); });",
    allowed: 'Use async/await',
  }),
  testCase({
    name: 'unpinned test tsconfig names types and lib',
    banned: 'writeFileSync(file, JSON.stringify({ compilerOptions: { strict: true } }));',
    allowed: "types: [] and lib: ['ES2022']",
  }),
  testCase({
    name: 'fixture script argv names the main guard',
    banned: 'const [root] = process.argv.slice(2);',
    allowed: 'only inside a main guard',
    filename: 'test/fixtures/fake-cli.ts',
  }),
];
