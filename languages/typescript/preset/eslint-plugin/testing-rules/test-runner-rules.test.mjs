import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noComments } from '../rules/modules/no-comments.mjs';
import { rule as noFixedSleepSynchronization } from '../rules/testing/lifecycle/no-fixed-sleep-synchronization.mjs';
import { rule as noInternalModuleMocks } from '../rules/testing/assertions/no-internal-module-mocks.mjs';
import { rule as noIntervalPollingInTests } from '../rules/testing/lifecycle/no-interval-polling-in-tests.mjs';
import { rule as noMockingSubjectUnderTest } from '../rules/testing/assertions/no-mocking-subject-under-test.mjs';
import { rule as noPartialOutputAssertion } from '../rules/testing/assertions/no-partial-output-assertion.mjs';
import { rule as noRaisedTestTimeout } from '../rules/testing/assertions/no-raised-test-timeout.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});
const filename = '/repo/src/main/feature/__tests__/feature.test.ts';
const pollFile = '/repo/tests/integration/poll.test.ts';
const jest = { nitpicker: { testRunner: 'jest' } };
const nodeTest = { nitpicker: { testRunner: 'node-test' } };

tester.run('no-internal-module-mocks across runners', noInternalModuleMocks, {
  valid: [
    { filename, code: "import { jest } from '@jest/globals'; jest.mock('undici');" },
    { filename, code: "import { mock } from 'node:test'; mock.module('undici');" },
    { filename, code: "import { mock } from 'node:test'; mock.fn(() => 1);" },
    { filename, code: "import { jest } from '@jest/globals'; jest.fn(() => 1);" },
  ],
  invalid: [
    { filename, code: "jest.mock('../collaborator.js');", errors: [{ messageId: 'internalMock' }] },
    {
      filename,
      code: "import { jest as mocks } from '@jest/globals'; mocks.doMock('../collaborator.js');",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      filename,
      code: "jest.unstable_mockModule('../collaborator.js', () => ({}));",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      filename,
      code: "import { mock } from 'node:test'; mock.module('../collaborator.js');",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      filename,
      code: "import { mock as replace } from 'node:test'; replace.module('../collaborator.js');",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      filename,
      code: "import test from 'node:test'; test.mock.module('../collaborator.js');",
      errors: [{ messageId: 'internalMock' }],
    },
  ],
});

tester.run('no-mocking-subject-under-test across runners', noMockingSubjectUnderTest, {
  valid: [
    {
      filename,
      code: "import { execute } from '../feature.js'; jest.mock('undici'); execute();",
    },
    {
      filename,
      code: "import { execute } from '../feature.js'; import { mock } from 'node:test'; mock.module('undici'); execute();",
    },
  ],
  invalid: [
    {
      filename,
      code: "import { execute } from '../feature.js'; jest.mock('../feature.js'); execute();",
      errors: [{ messageId: 'mockedSubject', data: { source: '../feature.js' } }],
    },
    {
      filename,
      code: "import { execute } from '../feature.js'; import { mock } from 'node:test'; mock.module('../feature.js'); execute();",
      errors: [{ messageId: 'mockedSubject', data: { source: '../feature.js' } }],
    },
  ],
});

tester.run('no-raised-test-timeout with jest.setTimeout', noRaisedTestTimeout, {
  valid: [
    { filename: pollFile, code: 'jest.setTimeout(10_000);' },
    { filename: pollFile, code: 'jest.setTimeout();' },
    { filename: pollFile, code: 'other.setTimeout(60_000);' },
  ],
  invalid: [
    {
      filename: pollFile,
      code: 'jest.setTimeout(60_000);',
      errors: [{ messageId: 'raisedTimeout' }],
    },
  ],
});

tester.run('no-fixed-sleep-synchronization advice per runner', noFixedSleepSynchronization, {
  valid: [],
  invalid: [
    {
      filename: pollFile,
      code: 'await sleep(500);',
      errors: [
        {
          message:
            'Fixed sleeps are non-deterministic; wait on a condition with vi.waitFor or expect.poll.',
        },
      ],
    },
    {
      filename: pollFile,
      settings: jest,
      code: 'await sleep(500);',
      errors: [
        {
          message:
            "Fixed sleeps are non-deterministic; wait on the condition itself: await the event or promise, or use your testing library's waitFor.",
        },
      ],
    },
    {
      filename: pollFile,
      settings: nodeTest,
      code: 'await sleep(500);',
      errors: [
        {
          message:
            'Fixed sleeps are non-deterministic; wait on the condition itself: await the event or promise, or drive time with mock.timers.',
        },
      ],
    },
  ],
});

tester.run('no-interval-polling-in-tests advice per runner', noIntervalPollingInTests, {
  valid: [],
  invalid: [
    {
      filename: pollFile,
      code: 'setInterval(tick, 500);',
      errors: [{ message: 'Prefer vi.waitFor / expect.poll over setInterval polling in tests.' }],
    },
    {
      filename: pollFile,
      settings: jest,
      code: 'setInterval(tick, 500);',
      errors: [
        {
          message:
            "Prefer awaiting the event or promise itself, or your testing library's waitFor, over setInterval polling in tests.",
        },
      ],
    },
    {
      filename: pollFile,
      settings: nodeTest,
      code: 'setInterval(tick, 500);',
      errors: [
        {
          message:
            'Prefer awaiting the event or promise itself, or driving time with mock.timers, over setInterval polling in tests.',
        },
      ],
    },
  ],
});

tester.run('no-partial-output-assertion with node:assert', noPartialOutputAssertion, {
  valid: [
    { filename: '/repo/test/report.test.ts', code: 'assert.deepStrictEqual(output, { a: 1 });' },
    {
      filename: '/repo/test/report.test.ts',
      code: 'matcher.partialDeepStrictEqual(output, { a: 1 });',
    },
  ],
  invalid: [
    {
      filename: '/repo/test/report.test.ts',
      code: 'assert.partialDeepStrictEqual(output, { a: 1 });',
      errors: [{ messageId: 'partialDeepEqual' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 't.assert.partialDeepStrictEqual(output, { a: 1 });',
      errors: [{ messageId: 'partialDeepEqual' }],
    },
  ],
});

tester.run('no-comments with Jest environment directives', noComments, {
  valid: [{ code: '/** @jest-environment node */\nexport const a = 1;' }],
  invalid: [],
});
