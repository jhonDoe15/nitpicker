import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import integrationTestUsesApprovedHarness from './rules/integration-test-uses-approved-harness.mjs';
import containerPauseRequiresFinallyUnpause from './rules/container-pause-requires-finally-unpause.mjs';
import boundedContainerTeardown from './rules/bounded-container-teardown.mjs';
import noFixedSleepSynchronization from './rules/no-fixed-sleep-synchronization.mjs';
import noIntervalPollingInTests from './rules/no-interval-polling-in-tests.mjs';
import noManagedResourceConstructionOutsideCompositionRoots from './rules/no-managed-resource-construction-outside-composition-roots.mjs';
import noModuleLevelLet from './rules/no-module-level-let.mjs';
import noMockingSubjectUnderTest from './rules/no-mocking-subject-under-test.mjs';
import noProductionConsole from './rules/no-production-console.mjs';
import noSilentCatch from './rules/no-silent-catch.mjs';
import reportModuleLoadEffects from './rules/report-module-load-effects.mjs';
import structuredCatchLogging from './rules/structured-catch-logging.mjs';
import testMustUseProductionRuntime from './rules/test-must-use-production-runtime.mjs';

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
      filename: '/repo/preset/test-runtime/fixtures/positive/tests/unit/fixture.test.ts',
      code: "import { describe } from 'vitest'; describe('fixture', () => {});",
      options: [{ exemptPattern: String.raw`/tests/contract/|/preset/.*/fixtures/` }],
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "import type { Feature } from '../feature.js'; const value: Feature | undefined = undefined;",
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

ruleTester.run('no-silent-catch', noSilentCatch, {
  valid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.warn('using fallback'); return toFailure(error); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error({ err: error }, 'failed'); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { throw error; }',
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch { useFallback(); }',
      errors: [{ messageId: 'missingBinding' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { useFallback(); }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.warn('using fallback'); }",
      errors: [{ messageId: 'silent' }],
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
