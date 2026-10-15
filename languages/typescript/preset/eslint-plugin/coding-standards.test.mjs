import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noWaitFor } from './rules/testing/assertions/no-wait-for-with-fake-timers.mjs';
import { rule as noInternalMocks } from './rules/testing/assertions/no-internal-module-mocks.mjs';
import { rule as preserveErrorCause } from './rules/errors/preserve-error-cause.mjs';
import { rule as structuredCatchLogging } from './rules/errors/structured-catch-logging.mjs';
import { rule as noExternalExecutables } from './rules/testing/processes/no-external-executables-in-unit-tests.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const filename = '/repo/src/main/feature/__tests__/feature.test.ts';

tester.run('keep caught causes in the Pino serializer', structuredCatchLogging, {
  valid: [
    "try { load(); } catch (error) { logger.warn({ err: error }, 'failed'); }",
    "try { load(); } catch (error) { const fields = { err: error, category: 'network' }; logger.error(fields, 'failed'); }",
  ],
  invalid: [
    {
      code: "try { load(); } catch (error) { const message = error instanceof Error ? error.message : 'failed'; logger.warn({ error: message }, 'failed'); }",
      errors: [{ messageId: 'caughtErrorShape' }],
    },
    {
      code: "try { load(); } catch (error) { logger.warn({ err: error.message }, 'failed'); }",
      errors: [{ messageId: 'caughtErrorShape' }],
    },
  ],
});

tester.run('fake clocks require explicit advancement', noWaitFor, {
  valid: [
    "it('real clock', async () => { await vi.waitFor(check); });",
    "it.each([1])('fake %s', () => { vi.useFakeTimers(); }); it('real sibling', async () => { await vi.waitFor(check); });",
    "it('fake', async () => { vi.useFakeTimers(); await vi.advanceTimersByTimeAsync(5); check(); });",
    "it('fake', () => { vi.useFakeTimers(); }); it('real', async () => { await vi.waitFor(check); }); afterEach(() => vi.useRealTimers());",
    "beforeEach(() => vi.useFakeTimers()); it('real override', async () => { vi.useRealTimers(); await vi.waitFor(check); });",
    "describe('fake', () => { beforeEach(() => vi.useFakeTimers()); it('direct', check); }); describe('real', () => { it('wait', async () => { await vi.waitFor(check); }); });",
  ],
  invalid: [
    {
      code: "it('fake', async () => { vi.useFakeTimers(); await vi.waitFor(check); });",
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: "test.each([1])('fake %s', async () => { vi.useFakeTimers(); await vi.waitFor(check); });",
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: "beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers()); it('fake', async () => { await vi.waitFor(check); });",
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: "describe('fake', () => { beforeEach(() => vi.useFakeTimers()); describe('nested', () => { it('wait', async () => { await vi.waitFor(check); }); }); });",
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: "import { vi as clock } from 'vitest'; it('fake', async () => { clock.useFakeTimers(); await clock.waitFor(check); });",
      errors: [{ messageId: 'fakeWait' }],
    },
  ],
});

tester.run('do not replace internal collaborators', noInternalMocks, {
  valid: [
    { filename, code: "vi.mock('undici');" },
    { filename, code: 'const serverFactory = () => fakeServer; start({ serverFactory });' },
  ],
  invalid: [
    {
      filename,
      code: "vi.mock('../../logging/logger.js');",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      filename,
      code: "import { vi as mocks } from 'vitest'; mocks.mock('../../config.js');",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      filename,
      code: "import { run } from '../feature.js'; vi.mock('../collaborator.js'); run();",
      errors: [{ messageId: 'internalMock' }],
    },
    { filename, code: "vi.doMock('../collaborator.js');", errors: [{ messageId: 'internalMock' }] },
    {
      filename,
      code: "vi.mock(import('../collaborator.js'));",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      filename,
      code: "import { vi as mocks } from 'vitest'; mocks.mock('../collaborator.js');",
      errors: [{ messageId: 'internalMock' }],
    },
  ],
});

tester.run('preserve wrapped error causes', preserveErrorCause, {
  valid: [
    'try { load(); } catch (error) { throw normalizeFailure(error); }',
    "try { load(); } catch (error) { throw new Error('bounded external failure'); }",
    "try { load(); } catch (error) { throw new Error('failed', { cause: error }); }",
    {
      code: "try { load(); } catch (error) { throw new DomainFailure('invalid-input'); }",
      options: [
        {
          wrappers: [
            {
              name: 'DomainFailure',
              optionsIndex: 2,
              classificationIndex: 0,
              unclassifiedValue: 'unknown',
            },
          ],
        },
      ],
    },
    {
      code: "try { load(); } catch (error) { throw new DomainFailure('unknown', undefined, { cause: error }); }",
      options: [
        {
          wrappers: [
            {
              name: 'DomainFailure',
              optionsIndex: 2,
              classificationIndex: 0,
              unclassifiedValue: 'unknown',
            },
          ],
        },
      ],
    },
  ],
  invalid: [
    {
      code: 'try { load(); } catch (error) { throw new Error(error.message); }',
      errors: [{ messageId: 'lostCause' }],
    },
    {
      code: "try { load(); } catch (error) { throw new DomainFailure('unknown'); }",
      options: [
        {
          wrappers: [
            {
              name: 'DomainFailure',
              optionsIndex: 2,
              classificationIndex: 0,
              unclassifiedValue: 'unknown',
            },
          ],
        },
      ],
      errors: [{ messageId: 'lostCause' }],
    },
  ],
});

tester.run('unit tests remain independent of external executables', noExternalExecutables, {
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
