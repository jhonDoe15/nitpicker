import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as integrationTestUsesApprovedHarness } from './rules/integration-test-uses-approved-harness.mjs';
import { rule as containerPauseRequiresFinallyUnpause } from './rules/container-pause-requires-finally-unpause.mjs';
import { rule as boundedContainerTeardown } from './rules/bounded-container-teardown.mjs';
import { rule as noFixedSleepSynchronization } from './rules/no-fixed-sleep-synchronization.mjs';
import { rule as noIntervalPollingInTests } from './rules/no-interval-polling-in-tests.mjs';
import { rule as noBranchInCompositionRoot } from './rules/no-branch-in-composition-root.mjs';
import { rule as noManagedResourceConstructionOutsideCompositionRoots } from './rules/no-managed-resource-construction-outside-composition-roots.mjs';
import { rule as noModuleLevelLet } from './rules/no-module-level-let.mjs';
import { rule as noMockingSubjectUnderTest } from './rules/no-mocking-subject-under-test.mjs';
import { rule as cognitiveComplexity } from './rules/cognitive-complexity.mjs';
import { rule as noProductionConsole } from './rules/no-production-console.mjs';
import { rule as noPartialOutputAssertion } from './rules/no-partial-output-assertion.mjs';
import { rule as noUnvalidatedSchemaField } from './rules/no-unvalidated-schema-field.mjs';
import { rule as reportModuleLoadEffects } from './rules/report-module-load-effects.mjs';
import { rule as structuredCatchLogging } from './rules/structured-catch-logging.mjs';
import { rule as testMustUseProductionRuntime } from './rules/test-must-use-production-runtime.mjs';

RuleTester.afterAll = afterAll;
RuleTester.afterEach = afterEach;
RuleTester.beforeAll = beforeAll;
RuleTester.beforeEach = beforeEach;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: tseslint.parser,
  },
});

ruleTester.run('container-pause-requires-finally-unpause', containerPauseRequiresFinallyUnpause, {
  valid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { return { ok: true, value: execute() }; } catch (error) { return { ok: false, reason: 'network' }; }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { return { ok: true, value: execute() }; } catch { return { ok: false, reason: 'network' }; }",
    },
    {
      filename: '/repo/tests/integration/paused.test.ts',
      code: 'try { await container.pause(); } finally { await container.unpause(); }',
    },
    {
      filename: '/repo/tests/integration/paused.test.ts',
      code: 'await withPausedContainer(container, async () => run());',
    },
    { filename: '/repo/tests/fixtures/container-teardown.ts', code: 'await container.pause();' },
    { filename: '/repo/tests/integration/paused.test.ts', code: 'await container.pause(1);' },
  ],
  invalid: [
    {
      filename: '/repo/tests/integration/paused.test.ts',
      code: 'await container.pause();',
      errors: [{ messageId: 'unguardedPause' }],
    },
    {
      filename: '/repo/tests/integration/paused.test.ts',
      code: 'try { run(); } finally { await container.pause(); }',
      errors: [{ messageId: 'unguardedPause' }],
    },
    {
      filename: '/repo/tests/integration/paused.test.ts',
      code: 'try { run(); } catch (error) { await container.pause(); } finally { cleanup(); }',
      errors: [{ messageId: 'unguardedPause' }],
    },
  ],
});

ruleTester.run('bounded-container-teardown', boundedContainerTeardown, {
  valid: [
    {
      filename: '/repo/tests/integration/cleanup.test.ts',
      code: 'afterAll(async () => { await teardownContainer(container); });',
    },
    {
      filename: '/repo/tests/integration/cleanup.test.ts',
      code: 'it("stops", async () => { await container.stop(); });',
    },
    {
      filename: '/repo/tests/integration/cleanup.test.ts',
      code: 'afterAll(async () => { await server.stop(); });',
    },
    {
      filename: '/repo/tests/integration/cleanup.test.ts',
      code: 'let cache: CacheClient; afterAll(async () => { await cache.stop(); });',
    },
    {
      filename: '/repo/tests/fixtures/container-teardown.ts',
      code: 'afterAll(async () => { await container.stop(); });',
    },
    {
      filename: '/repo/tests/integration/cleanup.test.ts',
      code: 'afterAll(async () => { await teardownAll(agent, databaseContainer); });',
    },
  ],
  invalid: [
    {
      filename: '/repo/tests/integration/cleanup.test.ts',
      code: 'afterAll(async () => { await container.stop(); });',
      errors: [{ messageId: 'unboundedStop' }],
    },
    {
      filename: '/repo/tests/integration/cleanup.test.ts',
      code: 'afterEach(() => fixture.databaseContainer.stop({ timeout: 0 }));',
      errors: [{ messageId: 'unboundedStop' }],
    },
    {
      filename: '/repo/tests/integration/cleanup.test.ts',
      code: 'afterAll(async () => { await container?.stop(); });',
      errors: [{ messageId: 'unboundedStop' }],
    },
    {
      filename: '/repo/tests/integration/cleanup.test.ts',
      code: 'let database: StartedTestContainer; afterAll(async () => { await database.stop(); });',
      errors: [{ messageId: 'unboundedStop' }],
    },
    {
      filename: '/repo/tests/integration/cleanup.test.ts',
      code: 'afterAll(async () => { await Promise.all([databaseContainer?.stop(), run()]); });',
      errors: [{ messageId: 'unboundedStop' }],
    },
    {
      filename: '/repo/tests/integration/cleanup.test.ts',
      code: 'afterAll(async () => { if (ready) { await testAgent.stop(); } });',
      errors: [{ messageId: 'unboundedStop' }],
    },
  ],
});

ruleTester.run('no-fixed-sleep-synchronization', noFixedSleepSynchronization, {
  valid: [
    { filename: '/repo/tests/integration/poll.test.ts', code: 'await vi.waitFor(() => ready());' },
    { filename: '/repo/tests/integration/poll.test.ts', code: 'await clock.sleep(10);' },
    {
      filename: '/repo/tests/integration/poll.test.ts',
      code: 'await new Promise((resolve) => onReady(resolve));',
    },
    {
      filename: '/repo/tests/fixtures/wait.ts',
      code: 'await sleep(500); await new Promise((resolve) => setTimeout(resolve, 500));',
    },
    {
      filename: '/repo/tests/fixtures/wait.ts',
      code: "import { setTimeout } from 'node:timers/promises'; await setTimeout(50);",
    },
    {
      filename: '/repo/tests/integration/poll.test.ts',
      code: "import { setTimeout } from './clock.js'; await setTimeout(50);",
    },
  ],
  invalid: [
    ...['sleep', 'delay', 'wait'].map((name) => ({
      filename: '/repo/tests/integration/poll.test.ts',
      code: `await ${name}(500);`,
      errors: [{ messageId: 'fixedSleep' }],
    })),
    {
      filename: '/repo/tests/integration/poll.test.ts',
      code: 'await new Promise((resolve) => setTimeout(resolve, 500));',
      errors: [{ messageId: 'fixedSleep' }],
    },
    {
      filename: '/repo/tests/integration/poll.test.ts',
      code: 'await new Promise(function (done) { if (pending) setTimeout(done, 500); });',
      errors: [{ messageId: 'fixedSleep' }],
    },
    // The form core/diff/cache-stores.test.mjs used, and the other spellings of the same sleep.
    ...[
      'await new Promise((resolve) => setTimeout(() => resolve(), 50));',
      'await new Promise((resolve) => { globalThis.setTimeout(() => { resolve(); }, 50); });',
      "import { setTimeout } from 'node:timers/promises'; await setTimeout(50);",
      "import { setTimeout as pause } from 'timers/promises'; await pause(50);",
      "import * as timers from 'node:timers/promises'; await timers.setTimeout(50);",
      "import { scheduler } from 'node:timers/promises'; await scheduler.wait(50);",
    ].map((code) => ({
      filename: '/repo/tests/integration/poll.test.ts',
      code,
      errors: [{ messageId: 'fixedSleep' }],
    })),
  ],
});

ruleTester.run('no-interval-polling-in-tests', noIntervalPollingInTests, {
  valid: [
    { filename: '/repo/tests/integration/poll.test.ts', code: 'await vi.waitFor(() => ready());' },
    { filename: '/repo/tests/integration/poll.test.ts', code: 'clock.setInterval(tick, 500);' },
    { filename: '/repo/tests/fixtures/poll.ts', code: 'setInterval(tick, 500);' },
  ],
  invalid: [
    {
      filename: '/repo/tests/integration/poll.test.ts',
      code: 'setInterval(tick, 500);',
      errors: [{ messageId: 'intervalPolling' }],
    },
    {
      filename: '/repo/tests/integration/poll.test.ts',
      code: 'globalThis.setInterval(tick, 500);',
      errors: [{ messageId: 'intervalPolling' }],
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

ruleTester.run('test-must-use-production-runtime', testMustUseProductionRuntime, {
  valid: [
    {
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "import { execute } from '../feature.js'; execute();",
    },
    {
      filename: '/repo/tests/contract/schema.test.ts',
      code: "import { describe } from 'vitest'; describe('schema', () => {});",
    },
    {
      // src/main/**/utils is ordinary production code, not a test-support
      // directory.
      filename: '/repo/src/main/utils/__tests__/format.test.ts',
      code: "import { execute } from '../format.js'; execute();",
    },
    {
      // A source root's index, imported as a directory.
      filename: '/repo/tests/url.test.ts',
      code: "import { parseURL } from '../src'; parseURL('/');",
    },
    {
      // An extensionless import of a source file.
      filename: '/repo/tests/url.test.ts',
      code: "import { parseURL } from '../src/parse'; parseURL('/');",
    },
    {
      // A dynamic import counts too — the common vi.mock()-then-reimport shape.
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "const { execute } = await import('../feature.js'); execute();",
    },
    {
      filename: '/repo/tests/greet.test.cjs',
      code: "const { greet } = require('../src/main/greet.cjs'); greet();",
    },
    {
      filename: '/repo/preset/test-runtime/fixtures/positive/tests/unit/fixture.test.ts',
      code: "import { describe } from 'vitest'; describe('fixture', () => {});",
      options: [{ exemptPattern: String.raw`/tests/contract/|/preset/.*/fixtures/` }],
    },
    {
      filename: '/repo/test/support/stdout.ts',
      code: "import { vi } from 'vitest'; export function captureStdout() { return vi.spyOn(process.stdout, 'write'); }",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "import type { Feature } from '../feature.js'; const value: Feature | undefined = undefined;",
      errors: [{ messageId: 'missingRuntime' }],
    },
    {
      filename: '/repo/tests/greet.test.cjs',
      code: "const path = require('node:path'); path.join('a');",
      errors: [{ messageId: 'missingRuntime' }],
    },
    {
      filename: '/repo/test/support/stdout.spec.ts',
      code: "import { captureStdout } from './stdout.js'; captureStdout();",
      errors: [{ messageId: 'missingRuntime' }],
    },
    {
      filename: '/repo/preset/test-runtime/fixtures/positive/tests/unit/fixture.test.ts',
      code: "import { describe } from 'vitest'; describe('fixture', () => {});",
      errors: [{ messageId: 'missingRuntime' }],
    },
  ],
});

ruleTester.run('no-mocking-subject-under-test', noMockingSubjectUnderTest, {
  valid: [
    {
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "import { execute } from '../feature.js'; import { vi } from 'vitest'; vi.mock('undici'); execute();",
    },
    {
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "import { execute } from '../feature.js'; import { vi } from 'vitest'; vi.mock('../infrastructure/http-seam.js'); execute();",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "import { execute } from '../feature.js'; import { vi } from 'vitest'; vi.mock('../feature.js'); execute();",
      errors: [{ messageId: 'mockedSubject', data: { source: '../feature.js' } }],
    },
  ],
});

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

ruleTester.run('structured-catch-logging', structuredCatchLogging, {
  valid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error({ err: error, operation: 'execute' }, 'failed'); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.warn({ err: toError(error) }, 'degraded'); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "logger.error({ error: 'business-state' }, 'business failure');",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error(error, 'failed'); }",
      errors: [{ messageId: 'caughtErrorShape' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error({ error }, 'failed'); }",
      errors: [{ messageId: 'caughtErrorShape' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error({ err: error }, { operation: 'execute' }, 'failed'); }",
      errors: [{ messageId: 'caughtErrorShape' }],
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

ruleTester.run('integration-test-uses-approved-harness', integrationTestUsesApprovedHarness, {
  valid: [
    {
      filename: '/repo/tests/integration/application.test.ts',
      code: "import { startApp as boot } from '../fixtures/app.js'; boot();",
    },
    {
      filename: '/repo/tests/integration/custom.test.ts',
      code: "import { createServer } from '../../src/main/server.js'; createServer();",
      options: [{ approvedFunctions: ['createServer'] }],
    },
    {
      filename: '/repo/tests/integration/app.test.ts',
      code: "import { AppProcess } from '../fixtures/app-process.js'; AppProcess.start();",
    },
  ],
  invalid: [
    {
      filename: '/repo/tests/integration/application.test.ts',
      code: "import { describe } from 'vitest'; describe('application', () => {});",
      errors: [{ messageId: 'missingHarness' }],
    },
    {
      filename: '/repo/tests/integration/custom.test.ts',
      code: "import { startApp } from '../fixtures/app.js'; startApp();",
      options: [{ approvedFunctions: ['createServer'] }],
      errors: [{ messageId: 'missingHarness' }],
    },
  ],
});

ruleTester.run('no-partial-output-assertion', noPartialOutputAssertion, {
  valid: [
    { filename: '/repo/test/report.test.ts', code: "expect(output).toEqual('a\\nb');" },
    { filename: '/repo/test/report.test.ts', code: "expect(output).toBe('a');" },
    { filename: '/repo/test/report.test.ts', code: "expect(output).not.toContain('secret');" },
    { filename: '/repo/test/report.test.ts', code: 'expect(output).not.toContain(`${a}`);' },
    { filename: '/repo/test/report.test.ts', code: 'expect(list).not.toContainEqual({ id: 1 });' },
    { filename: '/repo/test/report.test.ts', code: 'expect(list).toContain(item);' },
    { filename: '/repo/test/report.test.ts', code: "text.toContain('a');" },
    { filename: '/repo/test/report.test.ts', code: 'expect(output).not.toMatchObject({ a: 1 });' },
    { filename: '/repo/test/report.test.ts', code: 'matcher.toMatchObject({ a: 1 });' },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).not.toEqual(expect.objectContaining({ a: 1 }));',
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toEqual({ id: expect.any(String), tags: [expect.anything()] });',
    },
    { filename: '/repo/test/report.test.ts', code: 'expect(output).toEqual({ a: 1, b: [2, 3] });' },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toEqual({ a: expect.not.stringContaining('x') });",
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(send).toHaveBeenCalledWith(expect.objectContaining({ a: 1 }));',
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toEqual(build(expect.stringContaining('x')));",
    },
    { filename: '/repo/test/report.test.ts', code: 'expect(output).toEqual({ ...rest, a: 1 });' },
    { filename: '/repo/test/report.test.ts', code: 'expect(output).toEqual([, 1]);' },
  ],
  invalid: [
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toContain('fragment');",
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toContain(`line ${n}`);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(list).toContainEqual({ id: 1 });',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "await expect(promise).resolves.toContain('done');",
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect.soft(output).toContain('fragment');",
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(send()).toMatchObject({ channel: 'email' });",
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "await expect(send()).resolves.toMatchObject({ channel: 'email' });",
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(list).toMatchObject([{ id: 1 }]);',
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toEqual(expect.objectContaining({ a: 1 }));',
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toStrictEqual(expect.stringContaining('x'));",
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toEqual([expect.arrayContaining([1]), 2]);',
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toEqual({ to: 'a', body: expect.stringContaining('x') });",
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toEqual({ ...rest, nested: { items: [expect.objectContaining({ a: 1 })] } });',
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toEqual({ ...expect.objectContaining({ a: 1 }) });',
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toEqual({ a: expect.stringContaining('x'), b: expect.stringContaining('y') });",
      errors: [{ messageId: 'partialMatcher' }],
    },
  ],
});

const complexityOf = (value) => [{ messageId: 'tooComplex', data: { value, max: '0' } }];

ruleTester.run('cognitive-complexity', cognitiveComplexity, {
  valid: [
    { code: 'function plain(a: number) { return a + 1; }', options: [0] },
    { code: 'function one(a: boolean) { if (a) { return 1; } return 2; }', options: [1] },
    { code: 'const top = flag ? 1 : 2;', options: [0] },
    {
      code: 'function fallback(a?: string, b?: string) { return a ?? b ?? "none"; }',
      options: [0],
    },
    {
      code: 'function outer(items: readonly number[]) { return items.map((item) => item + 1); }',
      options: [0],
    },
  ],
  invalid: [
    {
      code: 'function chained(a: boolean, b: boolean) { if (a) { return 1; } else if (b ? a : b) { return 2; } return 0; }',
      options: [0],
      errors: complexityOf('3'),
    },
    {
      code: 'function within(a: boolean, b: boolean) { if (a) { return 1; } else if (b) { return a ? 2 : 3; } return 0; }',
      options: [0],
      errors: complexityOf('4'),
    },
    {
      code: [
        'function sumOfPrimes(max: number) {',
        '  let total = 0;',
        '  OUT: for (let i = 1; i <= max; ++i) {',
        '    for (let j = 2; j < i; ++j) {',
        '      if (i % j === 0) {',
        '        continue OUT;',
        '      }',
        '    }',
        '    total += i;',
        '  }',
        '  return total;',
        '}',
      ].join('\n'),
      options: [0],
      errors: complexityOf('7'),
    },
    {
      code: "function word(n: number) { switch (n) { case 1: return 'one'; default: return 'many'; } }",
      options: [0],
      errors: complexityOf('1'),
    },
    {
      code: 'function chain(a: boolean, b: boolean, c: boolean) { return a && b && c; }',
      options: [0],
      errors: complexityOf('1'),
    },
    {
      code: 'function mixed(a: boolean, b: boolean, c: boolean, d: boolean) { return (a && b) || (c && d); }',
      options: [0],
      errors: complexityOf('3'),
    },
    {
      code: 'function pick(a: number) { if (a > 2) { return 3; } else if (a > 1) { return 2; } else { return 1; } }',
      options: [0],
      errors: complexityOf('3'),
    },
    {
      code: 'function nested(a: boolean, b: boolean) { if (a) { if (b) { return 1; } } return 0; }',
      options: [0],
      errors: complexityOf('3'),
    },
    {
      code: 'function signs(items: readonly number[]) { return items.map((item) => (item > 0 ? 1 : -1)); }',
      options: [0],
      errors: complexityOf('1'),
    },
    {
      code: 'function guarded(run: () => number, a: boolean) { try { return run(); } catch { if (a) { return 1; } return 0; } }',
      options: [0],
      errors: complexityOf('3'),
    },
    {
      code: 'export const signOf = (n: number) => (n > 0 ? 1 : -1);',
      options: [0],
      errors: [{ messageId: 'tooComplex', line: 1, column: 35 }],
    },
    {
      code: 'function wide(a: boolean) { if (a) { return 1; } return 0; }',
      options: [0],
      errors: [{ messageId: 'tooComplex', line: 1, column: 10, data: { value: '1', max: '0' } }],
    },
  ],
});
