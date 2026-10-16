import { rule as noWaitFor } from '../../rules/testing/assertions/no-wait-for-with-fake-timers.mjs';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';

const ruleTester = typescriptRuleTester();
const waitFor = "import { waitFor } from '@testing-library/react';";
const nodeMock = "import { mock } from 'node:test';";
const lines = (...parts) => parts.join('\n');

ruleTester.run('no-wait-for-with-fake-timers across runners', noWaitFor, {
  valid: [
    lines(waitFor, "it('real', async () => { await waitFor(check); });"),
    lines(
      waitFor,
      "it('fake', async () => { jest.useFakeTimers(); await jest.advanceTimersByTimeAsync(5); });",
      "it('real', async () => { await waitFor(check); });",
    ),
    lines(
      waitFor,
      'beforeEach(() => jest.useFakeTimers());',
      "it('real again', async () => { jest.useRealTimers(); await waitFor(check); });",
    ),
    lines(
      "import { waitFor } from './helpers.js';",
      "it('own helper', async () => { jest.useFakeTimers(); await waitFor(check); });",
    ),
    lines(
      nodeMock,
      waitFor,
      "it('fake', () => { mock.timers.enable(); mock.timers.tick(5); });",
      "it('real', async () => { await waitFor(check); });",
    ),
    lines(
      nodeMock,
      waitFor,
      "it('reset', async () => { mock.timers.enable(); mock.timers.reset(); await waitFor(check); });",
    ),
    "it('other fake clock', async () => { jest.useFakeTimers(); await vi.waitFor(check); });",
    lines(waitFor, "it('unrelated', async () => { mock.timers.enable(); await waitFor(check); });"),
    lines(
      waitFor,
      'afterEach(() => jest.useFakeTimers());',
      "it('real', async () => { await waitFor(check); });",
    ),
  ],
  invalid: [
    {
      code: lines(
        waitFor,
        "it('fake', async () => { jest.useFakeTimers(); await waitFor(check); });",
      ),
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: lines(
        "import { jest as clock } from '@jest/globals';",
        "import { waitFor } from '@testing-library/dom';",
        "it('fake', async () => { clock.useFakeTimers(); await waitFor(check); });",
      ),
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: lines(
        waitFor,
        'beforeEach(() => jest.useFakeTimers());',
        "it('fake', async () => { await waitFor(check); });",
      ),
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: lines(
        waitFor,
        "describe('fake', () => {",
        '  beforeEach(() => jest.useFakeTimers());',
        "  it('wait', async () => { await waitFor(check); });",
        '});',
      ),
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: lines(
        nodeMock,
        waitFor,
        "it('fake', async () => { mock.timers.enable({ apis: ['setTimeout'] }); await waitFor(check); });",
      ),
      errors: [{ messageId: 'mockedWait' }],
    },
    {
      code: lines(
        waitFor,
        "it('fake', async (t) => { t.mock.timers.enable(); await waitFor(check); });",
      ),
      errors: [{ messageId: 'mockedWait' }],
    },
    {
      code: lines(
        "import { mock as doubles } from 'node:test';",
        waitFor,
        "it('fake', async () => { doubles.timers.enable(); await waitFor(check); });",
      ),
      errors: [{ messageId: 'mockedWait' }],
    },
  ],
});
