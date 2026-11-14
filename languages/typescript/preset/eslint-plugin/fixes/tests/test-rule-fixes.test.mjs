import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule as noTestRetry } from '../../test-assertions/no-test-retry.mjs';
import { rule as noRaisedTestTimeout } from '../../rules/testing/assertions/no-raised-test-timeout.mjs';
import { rule as fakeTimersRequireRestore } from '../../test-quality/fake-timers-require-restore.mjs';
import { rule as testTsconfigPins } from '../../rules/testing/types/test-tsconfig-pins-lib-and-types.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/tests/unit/service.test.ts';
const retry = [{ messageId: 'retry' }];
const lines = (...parts) => parts.join('\n');

tester.run('no-test-retry fixes', noTestRetry, {
  valid: [],
  invalid: [
    {
      filename,
      code: "it('runs', { retry: 2 }, () => {});",
      errors: retry,
      output: "it('runs', {}, () => {});",
    },
    {
      filename,
      code: "it('runs', { timeout: 5000, retries: 2 }, () => {});",
      errors: retry,
      output: "it('runs', { timeout: 5000 }, () => {});",
    },
    {
      filename,
      code: "it('runs', { retry: 2, timeout: 5000 }, () => {});",
      errors: retry,
      output: "it('runs', { timeout: 5000 }, () => {});",
    },
    {
      filename,
      code: 'vi.setConfig({ retry: 3 });',
      errors: retry,
      output: 'vi.setConfig({});',
    },
    {
      filename,
      code: lines('import { x } from "y";', 'jest.retryTimes(3);', 'x();'),
      errors: retry,
      output: lines('import { x } from "y";', 'x();'),
    },
    {
      filename,
      code: "describe('suite', function () { this.retries(2); });",
      errors: retry,
      output: "describe('suite', function () {  });",
    },
    {
      filename,
      code: "const options = { retry: 2 }; it('runs', options, () => {});",
      errors: retry,
      output: null,
    },
    {
      filename,
      code: "it('runs', { ...{ retry: 2 } }, () => {});",
      errors: retry,
      output: null,
    },
    {
      filename,
      code: "const attempts = jest.retryTimes(3);\nit('runs', () => {});",
      errors: retry,
      output: null,
    },
  ],
});

const raised = [{ messageId: 'raisedTimeout' }];
const dropped = (output) => [
  { messageId: 'raisedTimeout', suggestions: [{ messageId: 'dropTimeout', output }] },
];

tester.run('no-raised-test-timeout suggestions', noRaisedTestTimeout, {
  valid: [],
  invalid: [
    {
      filename,
      code: "it('runs', () => {}, 60_000);",
      errors: dropped("it('runs', () => {});"),
    },
    {
      filename,
      code: 'beforeAll(() => {}, 60_000);',
      errors: dropped('beforeAll(() => {});'),
    },
    {
      filename,
      code: "it('runs', { timeout: 60_000 }, () => {});",
      errors: dropped("it('runs', {}, () => {});"),
    },
    {
      filename,
      code: 'vi.setConfig({ testTimeout: 60_000, retry: 0 });',
      errors: dropped('vi.setConfig({ retry: 0 });'),
    },
    {
      filename,
      code: "const options = { timeout: 60_000 }; it('runs', options, () => {});",
      errors: raised,
    },
    {
      filename,
      code: "it('runs', 60_000, () => {});",
      errors: raised,
    },
  ],
});

const restored = (call, restore) =>
  lines(
    "import { afterEach, vi } from 'vitest';",
    `${call};`,
    '',
    'afterEach(() => {',
    `  vi.${restore}();`,
    '});',
  );

tester.run('fake-timers-require-restore fixes', fakeTimersRequireRestore, {
  valid: [],
  invalid: [
    {
      filename,
      code: lines("import { afterEach, vi } from 'vitest';", 'vi.useFakeTimers();'),
      errors: [{ messageId: 'unrestored' }],
      output: restored('vi.useFakeTimers()', 'useRealTimers'),
    },
    {
      filename,
      options: [{ globals: true, envs: true }],
      code: lines(
        "import { afterEach, describe, vi } from 'vitest';",
        "describe('suite', () => {",
        "  it('runs', () => {",
        "    vi.stubEnv('MODE', 'test');",
        '  });',
        '});',
      ),
      errors: [{ messageId: 'unrestoredEnv' }],
      output: lines(
        "import { afterEach, describe, vi } from 'vitest';",
        "describe('suite', () => {",
        "  it('runs', () => {",
        "    vi.stubEnv('MODE', 'test');",
        '  });',
        '',
        '  afterEach(() => {',
        '    vi.unstubAllEnvs();',
        '  });',
        '});',
      ),
    },
    {
      filename,
      code: lines('vi.useFakeTimers();', 'vi.useFakeTimers();'),
      errors: [{ messageId: 'unrestored' }, { messageId: 'unrestored' }],
      output: lines(
        'vi.useFakeTimers();',
        '',
        'afterEach(() => {',
        '  vi.useRealTimers();',
        '});',
        'vi.useFakeTimers();',
      ),
    },
    {
      filename,
      code: lines("import { vi } from 'vitest';", 'vi.useFakeTimers();'),
      errors: [{ messageId: 'unrestored' }],
      output: null,
    },
    {
      filename,
      code: 'function setup() { vi.useFakeTimers(); }',
      errors: [{ messageId: 'unrestored' }],
      output: null,
    },
  ],
});

const unpinned = [{ messageId: 'unpinnedTsconfig' }];

tester.run('test-tsconfig-pins-lib-and-types fixes', testTsconfigPins, {
  valid: [],
  invalid: [
    {
      filename,
      code: 'JSON.stringify({ compilerOptions: { strict: true } });',
      errors: unpinned,
      output: "JSON.stringify({ compilerOptions: { strict: true, types: [], lib: ['ES2022'] } });",
    },
    {
      filename,
      code: 'JSON.stringify({ compilerOptions: { types: [] } });',
      errors: unpinned,
      output: "JSON.stringify({ compilerOptions: { types: [], lib: ['ES2022'] } });",
    },
    {
      filename,
      code: "JSON.stringify({ compilerOptions: { lib: ['ES2022'] } });",
      errors: unpinned,
      output: "JSON.stringify({ compilerOptions: { lib: ['ES2022'], types: [] } });",
    },
    {
      filename,
      code: 'JSON.stringify({ compilerOptions: {} });',
      errors: unpinned,
      output: "JSON.stringify({ compilerOptions: { types: [], lib: ['ES2022'] } });",
    },
    {
      filename,
      code: 'const options = { strict: true }; JSON.stringify({ compilerOptions: options });',
      errors: unpinned,
      output: null,
    },
  ],
});
