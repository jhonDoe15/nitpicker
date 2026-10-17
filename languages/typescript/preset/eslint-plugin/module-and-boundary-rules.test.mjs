import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noModuleLevelLet } from './rules/modules/no-module-level-let.mjs';
import { rule as noProductionConsole } from './rules/modules/no-production-console.mjs';
import { rule as reportModuleLoadEffects } from './rules/modules/report-module-load-effects.mjs';
import { rule as noUnvalidatedSchemaField } from './rules/boundaries/no-unvalidated-schema-field.mjs';
import { rule as noBranchInCompositionRoot } from './rules/boundaries/no-branch-in-composition-root.mjs';
import { rule as noProcessGlobalsOutsideMainGuard } from './rules/modules/no-process-globals-outside-main-guard.mjs';
import { rule as noManagedResourceConstructionOutsideCompositionRoots } from './rules/boundaries/no-managed-resource-construction-outside-composition-roots.mjs';

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

const lines = (...parts) => parts.join('\n');
ruleTester.run('no-unvalidated-schema-field', noUnvalidatedSchemaField, {
  valid: [
    "import { z } from 'zod'; const s = z.object({ name: z.string().trim().min(1), email: z.email() });",
    "import { z } from 'zod'; const s = z.array(z.unknown());",
    "import { z } from 'zod'; const s = z.unknown();",
    "import { z } from 'zod'; const s = z.object({ items: z.array(z.string()) });",
    "import { z } from 'zod'; const s = z.object({ value: z.unknown().refine(isPrice) });",
    "import { z } from 'zod'; const s = z.object({ value: z.unknown().pipe(z.string()) });",
    "import { z } from 'zod'; const s = z.object({ ...base, id: z.string() });",
    "import { z } from 'zod'; const s = z.object(shape);",
    'const s = schemas.object({ value: schemas.unknown() });',
    'const s = z.object({ value: unknown() });',
  ],
  invalid: [
    {
      code: "import { z } from 'zod'; const s = z.object({ name: z.unknown() });",
      errors: [{ messageId: 'unvalidatedField', data: { factory: 'z.unknown' } }],
    },
    {
      code: "import { z } from 'zod'; const s = z.object({ name: z.any() });",
      errors: [{ messageId: 'unvalidatedField', data: { factory: 'z.any' } }],
    },
    {
      code: "import { z } from 'zod'; const s = z.object({ name: z.unknown().optional() });",
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: "import { z } from 'zod'; const s = z.strictObject({ a: z.string(), b: z.any().nullable().describe('x') });",
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: "import { z } from 'zod'; const s = z.object({ a: z.unknown(), b: z.unknown() });",
      errors: [{ messageId: 'unvalidatedField' }, { messageId: 'unvalidatedField' }],
    },
    {
      code: "import { z } from 'zod'; const s = z.array(z.object({ inner: z.object({ id: z.unknown() }) }));",
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: "import * as validators from 'zod'; const s = validators.object({ id: validators.unknown() });",
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: "import { z as schema } from 'zod/v4'; const s = schema.object({ id: schema.any() });",
      errors: [{ messageId: 'unvalidatedField' }],
    },
  ],
});
ruleTester.run('no-production-console', noProductionConsole, {
  valid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "logger.warn({ component: 'feature' }, 'degraded');",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "console.warn('degraded');",
      errors: [{ messageId: 'consoleCall', data: { method: 'warn' } }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "console.error('failed');",
      errors: [{ messageId: 'consoleCall', data: { method: 'error' } }],
    },
  ],
});
ruleTester.run('report-module-load-effects', reportModuleLoadEffects, {
  valid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "import { initialize } from './runtime.js'; export function start() { initialize(); if (enabled()) { configure(); } }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "'use strict'; const labels = new Set(['one']); export class Deferred { start() { return run(); } }",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/bootstrap.ts',
      code: "import './side-effect.js';",
      errors: [{ messageId: 'sideEffectImport' }],
    },
    {
      filename: '/repo/src/main/bootstrap.ts',
      code: 'initialize();',
      errors: [{ messageId: 'topLevelExpression' }],
    },
    {
      filename: '/repo/src/main/bootstrap.ts',
      code: 'if (enabled()) { initialize(); }',
      errors: [{ messageId: 'topLevelControl' }],
    },
    {
      filename: '/repo/src/main/bootstrap.ts',
      code: 'await initialize();',
      errors: [{ messageId: 'topLevelAwait' }],
    },
    {
      filename: '/repo/src/main/bootstrap.ts',
      code: 'export class Registry { static { initialize(); } }',
      errors: [{ messageId: 'staticBlock' }],
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
ruleTester.run('no-branch-in-composition-root', noBranchInCompositionRoot, {
  valid: [
    {
      filename: '/repo/src/main/composition-root.ts',
      code: 'export function main(names) { runGreeting(names, { write: (text) => process.stdout.write(text) }); }',
    },
    {
      filename: '/repo/src/main/composition-root.ts',
      code: 'const ready = left && right; const label = left || right; export function pick() { return left && right; }',
    },
    {
      filename: '/repo/src/main/features/books/adapters/lookup.ts',
      code: 'export function find(book) { if (book === undefined) { return undefined; } return book?.title ?? "none"; }',
    },
    {
      filename: '/repo/src/main/compose.ts',
      code: 'export function pick(book) { return book === undefined ? 1 : 2; }',
    },
    {
      filename: '/repo/src/main/wiring/registry.ts',
      code: 'export function pick(book) { if (book) { return 1; } return 2; }',
    },
    {
      filename: '/repo/src/main/composition-root.ts',
      code: "if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) { main(); }",
    },
    ...[
      "const container = document.getElementById('root'); if (container === null) { throw new Error('#root is missing'); } createRoot(container).render(app);",
      "if (container === null) throw new Error('#root is missing');",
    ].map((code) => ({ filename: '/repo/src/main.tsx', code })),
  ],
  invalid: [
    {
      filename: '/repo/src/main/composition-root.ts',
      code: 'export function titleOf(book) { if (book === undefined) { return undefined; } return book.title; }',
      errors: [{ messageId: 'branch' }],
    },
    {
      filename: '/repo/src/main/composition-root.ts',
      code: 'export function titleOf(book) { return book === undefined ? "none" : book.title; }',
      errors: [{ messageId: 'branch' }],
    },
    {
      filename: '/repo/src/main/composition-root.ts',
      code: 'export function label(kind) { switch (kind) { case "a": return 1; default: return 2; } }',
      errors: [{ messageId: 'branch' }],
    },
    {
      filename: '/repo/src/main/composition-root.ts',
      code: 'export function titleOf(book, fallback) { return book ?? fallback; }',
      errors: [{ messageId: 'branch' }],
    },
    {
      filename: '/repo/src/main/composition-root.ts',
      code: 'export function titleOf(catalog, id) { return catalog.find(id)?.title; }',
      errors: [{ messageId: 'branch' }],
    },
    {
      filename: '/repo/src/main/composition-root.ts',
      code: 'export function titleOf(book) { if (book === undefined) { return 1; } else if (book.id === "a") { return 2; } return 3; }',
      errors: [{ messageId: 'branch' }, { messageId: 'branch' }],
    },
    {
      filename: '/repo/src/main/composition-root.ts',
      code: 'if (import.meta.main) { if (ready) { main(); } }',
      errors: [{ messageId: 'branch' }],
    },
    ...[
      'if (container !== null) { createRoot(container).render(app); }',
      "if (container === null) { throw new Error('missing'); } else { createRoot(container); }",
      "if (container === null) { log('missing'); throw new Error('missing'); }",
    ].map((code) => ({ filename: '/repo/src/main.tsx', code, errors: [{ messageId: 'branch' }] })),
    {
      filename: '/repo/src/main/main.ts',
      code: 'export const pick = (book) => (book ? 1 : 2);',
      errors: [{ messageId: 'branch' }],
    },
    {
      filename: '/repo/src/main/server.ts',
      code: 'export function pick(book) { if (book) { return 1; } return 2; }',
      errors: [{ messageId: 'branch' }],
    },
    {
      filename: '/repo/src/main/wiring/registry.ts',
      code: 'export function pick(book) { if (book) { return 1; } return 2; }',
      options: [{ compositionRootPattern: '/wiring/' }],
      errors: [{ messageId: 'branch' }],
    },
    {
      filename: '/repo/src/main/server.ts',
      code: 'export function pick(book) { if (book) { return 1; } return 2; }',
      options: [{ compositionRootPattern: '/wiring/' }],
      errors: [{ messageId: 'branch' }],
    },
  ],
});
ruleTester.run(
  'no-managed-resource-construction-outside-composition-roots',
  noManagedResourceConstructionOutsideCompositionRoots,
  {
    valid: [
      {
        filename: '/repo/src/main/composition-root.ts',
        code: 'const cache = new WidgetCache();',
      },
      {
        filename: '/repo/src/main/features/handler.ts',
        code: 'const command = new RefreshCommand(); const values = new Map();',
      },
      {
        filename: '/repo/src/main/wiring/registry.ts',
        code: 'const registry = new RegistryService();',
        options: [{ compositionRootPattern: '/wiring/' }],
      },
      {
        filename: '/repo/src/main/server.ts',
        code: 'const client = new WidgetClient();',
        options: [{ compositionRootPattern: '/wiring/' }],
      },
    ],
    invalid: [
      {
        filename: '/repo/src/main/widget-factory.ts',
        code: 'const client = new WidgetClient();',
        errors: [{ messageId: 'outsideRoot', data: { name: 'WidgetClient' } }],
      },
      {
        filename: '/repo/src/main/features/handler.ts',
        code: 'const client = new WidgetClient();',
        errors: [{ messageId: 'outsideRoot', data: { name: 'WidgetClient' } }],
      },
      {
        filename: '/repo/src/main/features/handler.ts',
        code: 'const client = new WidgetClient();',
        options: [{ compositionRootPattern: '/wiring/' }],
        errors: [{ messageId: 'outsideRoot', data: { name: 'WidgetClient' } }],
      },
    ],
  },
);
ruleTester.run('no-module-level-let', noModuleLevelLet, {
  valid: [
    { code: 'const limit = 1;' },
    { code: 'export const limit = 1;' },
    { code: 'function count() { let total = 0; return total; }' },
    { code: 'for (let index = 0; index < 3; index += 1) {}' },
    { code: 'if (flag) { let inner = 1; }' },
  ],
  invalid: [
    { code: 'let counter = 0;', errors: [{ messageId: 'moduleLet' }] },
    { code: 'export let counter = 0;', errors: [{ messageId: 'moduleLet' }] },
    { code: 'let a = 1, b = 2;', errors: [{ messageId: 'moduleLet' }] },
  ],
});
