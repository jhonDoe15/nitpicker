import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as containerPauseRequiresFinallyUnpause } from './rules/testing/lifecycle/container-pause-requires-finally-unpause.mjs';
import { rule as boundedContainerTeardown } from './rules/testing/lifecycle/bounded-container-teardown.mjs';
import { rule as noFixedSleepSynchronization } from './rules/testing/lifecycle/no-fixed-sleep-synchronization.mjs';
import { rule as noIntervalPollingInTests } from './rules/testing/lifecycle/no-interval-polling-in-tests.mjs';
import { rule as noBranchInCompositionRoot } from './rules/boundaries/no-branch-in-composition-root.mjs';
import { rule as noManagedResourceConstructionOutsideCompositionRoots } from './rules/boundaries/no-managed-resource-construction-outside-composition-roots.mjs';
import { rule as noModuleLevelLet } from './rules/modules/no-module-level-let.mjs';

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
    // The form core/diff/cache/cache-stores.test.mjs used, and the other spellings of the same sleep.
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
