import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import path from 'node:path';
import loggingConfig from '../eslint-config/logging.mjs';
import strictSyntaxConfig, { strictConfig } from '../eslint-config/strict.mjs';
import { domainFailureMessageCases } from './domain-cases.mjs';
import { strictDomainConfig } from '../eslint-config/strict-domain.mjs';
import strictAdaptersConfig from '../eslint-config/strict-adapters.mjs';
import { adapterFailureMessageCases } from './adapter-cases.mjs';
import { strictCompositionRootConfig } from '../eslint-config/strict-composition-root.mjs';
import { reactFailureMessageCases } from './react-cases.mjs';
import { testFailureMessageCases } from './test-cases.mjs';

const cognitiveComplexityConfig = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: { 'nitpicker/cognitive-complexity': ['error', 0] },
  },
];

function strictCase([name, banned, allowed, filename = 'src/fixture.ts']) {
  return { name, config: strictSyntaxConfig, filename, banned, allowed };
}

const typedStrictConfig = strictConfig({
  projectService: { allowDefaultProject: ['src/*.ts'] },
  tsconfigRootDir: process.cwd(),
});

export const failureMessageCases = [
  {
    name: 'console call names the application logger',
    config: loggingConfig,
    filename: 'src/service.ts',
    banned: 'console.log("started");',
    allowed: 'application logger',
  },
  ...[
    ['as assertion names narrowing', 'const value = input as string;', 'narrow'],
    ['angle-bracket assertion names narrowing', 'const value = <string>input;', 'narrow'],
    ['any names unknown', 'export function read(input: any) { return input; }', '`unknown`'],
    ['non-null assertion names the undefined check', 'const value = map.get(key)!;', 'undefined'],
    ['null literal names undefined', 'const value = null;', '`undefined`'],
    ['null return names undefined', 'function find() { return null; }', '`undefined`'],
    ['null type names undefined', 'type Maybe = string | null;', '`undefined`'],
    [
      'ts-ignore names fixing the type error',
      '// @ts-ignore\nconst value: number = "a";',
      'fix the type error',
    ],
    [
      'ts-expect-error names fixing the type error',
      '// @ts-expect-error\nconst value: number = "a";',
      'fix the type error',
    ],
    [
      'ts-nocheck names fixing the type error',
      '// @ts-nocheck\nconst value = 1;',
      'fix the type error',
    ],
    [
      'eslint-disable names the config exception',
      '// eslint-disable-next-line no-console\nconst value = 1;',
      'nitpicker config file',
    ],
    [
      'line comment names descriptive code',
      '// increments the counter\nconst value = 1;',
      'descriptive identifier',
    ],
    [
      'block comment names descriptive code',
      '/* explains */\nconst value = 1;',
      'descriptive identifier',
    ],
    ['interface names type', 'interface Shape { size: number }', '`type`'],
    [
      'enum names a union of string literals',
      'enum Mode { Read, Write }',
      'union of string literals',
    ],
    [
      'namespace names a module with named exports',
      'namespace Tools { export const a = 1; }',
      'named exports',
    ],
    ['class names Error subclasses', 'class Service { run() {} }', '`Error` subclasses'],
    [
      'class expression names Error subclasses',
      'const Service = class { run() {} };',
      '`Error` subclasses',
    ],
    ['arrow function names the function keyword', 'const read = () => 1;', '`function` keyword'],
    [
      'function expression names the function keyword',
      'const read = function () { return 1; };',
      '`function` keyword',
    ],
    [
      'default export names a named export',
      'export default function read() { return 1; }',
      'named export',
    ],
    [
      'default specifier names a named export',
      'const read = 1; export { read as default };',
      'named export',
    ],
    [
      'else after return names early return',
      'function read(a) { if (a) { return 1; } else { return 2; } }',
      'return early',
    ],
    [
      'else-if after return names early return',
      'function read(a) { if (a) { return 1; } else if (a > 1) { return 2; } return 3; }',
      'return early',
    ],
    ['nested ternary names early returns', 'const value = a ? 1 : b ? 2 : 3;', 'early returns'],
    ...['src/main/shared/x.ts', 'src/x.ts'].flatMap((filename) =>
      [
        ['for(;;)', 'for (let i = 0; i < 3; i++) { run(i); }', 'for...of'],
        ['for...in', 'for (const key in record) { run(key); }', 'for...of'],
        ['while', 'while (queue.length > 0) { run(queue.pop()); }', 'for...of'],
        ['do-while', 'do { run(); } while (more());', 'for...of'],
        ['forEach', 'items.forEach((item) => run(item));', 'for...of'],
        ['then chain', 'fetchOne().then((value) => use(value));', 'async/await'],
        ['catch chain', 'fetchOne().catch((error) => use(error));', 'try/catch'],
        ['finally chain', 'fetchOne().finally(() => done());', 'async/await'],
        ['loose equality', 'const same = a == b;', "'==='"],
        ['loose inequality', 'const differs = a != b;', "'!=='"],
      ].map(([form, banned, allowed]) => [
        `${filename} ${form} names ${allowed}`,
        banned,
        allowed,
        filename,
      ]),
    ),
  ].map(strictCase),
  {
    name: 'floating promise in shared code names awaiting it',
    config: typedStrictConfig,
    filename: path.resolve('src/fixture.ts'),
    banned: 'export async function load() { return 1; }\nexport function run() { load(); }',
    allowed: 'awaited',
  },
  {
    name: 'non-exhaustive switch names exhaustive handling',
    config: typedStrictConfig,
    filename: path.resolve('src/fixture.ts'),
    banned:
      "type Shape = { kind: 'a' } | { kind: 'b' };\nexport function read(shape: Shape) { switch (shape.kind) { case 'a': return 1; } return 0; }",
    allowed: 'exhaustive',
  },
  ...domainFailureMessageCases,
  {
    name: 'domain recursion names flatMap',
    config: strictDomainConfig,
    filename: 'src/main/features/billing/domain/total.ts',
    banned: 'function total(items) { return items.length === 0 ? 0 : 1 + total(items.slice(1)); }',
    allowed: 'flatMap',
  },
  {
    name: 'domain arrow recursion names flatMap',
    config: strictDomainConfig,
    filename: 'src/main/features/billing/domain/walk.ts',
    banned: 'const walk = (node) => node.children.flatMap((child) => walk(child));',
    allowed: 'flatMap',
  },
  {
    name: 'domain throw names the discriminated-union result',
    config: strictDomainConfig,
    filename: 'src/main/features/billing/domain/parse.ts',
    banned: 'function parse(input) { if (!input) { throw new Error("empty"); } return input; }',
    allowed: 'discriminated-union failure result',
  },
  {
    name: 'adapter for(;;) names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'for (let i = 0; i < 3; i++) { run(i); }',
    allowed: 'for...of',
  },
  {
    name: 'adapter for...in names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'for (const key in record) { run(key); }',
    allowed: 'for...of',
  },
  {
    name: 'adapter while names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'while (queue.length > 0) { run(queue.pop()); }',
    allowed: 'for...of',
  },
  {
    name: 'adapter do-while names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'do { run(); } while (more());',
    allowed: 'for...of',
  },
  {
    name: 'adapter forEach names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'items.forEach((item) => run(item));',
    allowed: 'for...of',
  },
  {
    name: 'adapter then chain names async/await',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'fetchOne().then((value) => use(value));',
    allowed: 'async/await',
  },
  {
    name: 'adapter catch chain names async/await',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'fetchOne().catch((error) => use(error));',
    allowed: 'try/catch',
  },
  {
    name: 'adapter bare Error names Error subclass',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: "function f() { throw new Error('failed'); }",
    allowed: 'Error subclass',
  },
  {
    name: 'adapter literal throw names Error subclass',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: "function f() { throw 'failed'; }",
    allowed: 'preserves cause',
  },
  {
    name: 'adapter silent catch names rethrowing with cause',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'try { run(); } catch (error) { cleanup(); }',
    allowed: '{ cause: error }',
  },
  {
    name: 'adapter silent catch names the failure result',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'try { run(); } catch { return []; }',
    allowed: 'Return a failure result',
  },
  {
    name: 'adapter self-recursion names a for...of loop for retries',
    config: strictSyntaxConfig,
    filename: 'src/main/features/billing/adapters/http.ts',
    banned: 'async function fetchWithRetry(n) { return n > 0 ? fetchWithRetry(n - 1) : 0; }',
    allowed: 'for...of',
  },
  {
    name: 'adapter tree-walk recursion names a worklist',
    config: strictSyntaxConfig,
    filename: 'src/main/features/billing/adapters/walk.ts',
    banned: 'function walk(node) { return node.children.flatMap((child) => walk(child)); }',
    allowed: 'worklist',
  },
  {
    name: 'composition-root self-recursion names a for...of loop for retries',
    config: strictSyntaxConfig,
    filename: 'src/main/composition-root.ts',
    banned: 'function poll(n) { return n > 0 ? poll(n - 1) : 0; }',
    allowed: 'for...of',
  },
  {
    name: 'adapter empty catch is rejected',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'try { run(); } catch (error) {}',
    allowed: 'Return a failure result',
  },
  {
    name: 'adapter lost cause names cause',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'try { run(); } catch (error) { throw new Error(String(error)); }',
    allowed: 'original cause',
  },
  ...adapterFailureMessageCases,
  {
    name: 'composition-root branch names the feature adapters',
    config: strictCompositionRootConfig,
    filename: 'src/main/composition-root.ts',
    banned:
      'export function titleOf(book) { if (book === undefined) { return undefined; } return book.title; }',
    allowed: "feature's adapters/",
  },
  {
    name: 'composition-root branch names the exception in the config file',
    config: strictCompositionRootConfig,
    filename: 'src/main/composition-root.ts',
    banned: 'export function titleOf(book) { return book?.title ?? "none"; }',
    allowed: 'exception for this rule in nitpicker.config.json',
  },
  {
    name: 'construction in a factory-named file names the composition root',
    config: strictCompositionRootConfig,
    filename: 'src/main/widget-factory.ts',
    banned: 'const client = new WidgetClient();',
    allowed: 'only in the composition root',
  },
  {
    name: 'construction in a feature names passing it in as a parameter',
    config: strictCompositionRootConfig,
    filename: 'src/main/features/auth/handler.ts',
    banned: 'const client = new WidgetClient();',
    allowed: 'pass it in as a parameter',
  },
  {
    name: 'module-level let names const',
    config: strictCompositionRootConfig,
    filename: 'src/main/state.ts',
    banned: 'let counter = 0;',
    allowed: "use 'const'",
  },
  ...testFailureMessageCases,
  {
    name: 'cognitive complexity names smaller functions',
    config: cognitiveComplexityConfig,
    filename: 'src/fixture.ts',
    banned: 'export function pick(a: boolean) { if (a) { return 1; } return 0; }',
    allowed: 'smaller named functions',
  },
  {
    name: 'cognitive complexity names the exception in the config file',
    config: cognitiveComplexityConfig,
    filename: 'src/fixture.ts',
    banned: 'export function pick(a: boolean) { if (a) { return 1; } return 0; }',
    allowed: 'exception for this rule in nitpicker.config.json',
  },
  ...reactFailureMessageCases,
];
