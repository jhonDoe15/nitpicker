import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noUninjectableDelay } from '../rules/testing/lifecycle/no-uninjectable-delay.mjs';
import { rule as boundedContainerTeardown } from '../rules/testing/lifecycle/bounded-container-teardown.mjs';
import { rule as noFirstTestChargedSetup } from '../rules/testing/lifecycle/no-first-test-charged-setup.mjs';
import { rule as noIntervalPollingInTests } from '../rules/testing/lifecycle/no-interval-polling-in-tests.mjs';
import { rule as noFixedSleepSynchronization } from '../rules/testing/lifecycle/no-fixed-sleep-synchronization.mjs';
import { rule as containerPauseRequiresFinallyUnpause } from '../rules/testing/lifecycle/container-pause-requires-finally-unpause.mjs';

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
const sourceFile = '/repo/src/service.ts';
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
      errors: [
        {
          messageId: 'chargedSetup',
          data: { name: 'built', sharedSetupHook: 'beforeAll' },
          line: 2,
        },
      ],
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
