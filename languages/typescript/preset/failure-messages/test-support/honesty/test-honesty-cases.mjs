import tseslint from 'typescript-eslint';
import { resolveLayout } from '../../../layout.mjs';
import { strictTestConfigFor } from '../../../eslint-config/strict-tests.mjs';
import { testHonestyConfigFor } from '../../../eslint-config/test-honesty/index.mjs';

const layout = resolveLayout();
const config = [
  { languageOptions: { parser: tseslint.parser } },
  ...strictTestConfigFor(layout),
  ...testHonestyConfigFor(layout, { setupFiles: ['test/setup.ts'] }),
];

function honestyCase([name, banned, allowed, filename = 'test/orders.test.ts']) {
  return { name: `test honesty: ${name}`, config, filename, banned, allowed };
}

const HONESTY_ROWS = [
  [
    'literal expect subject names the value under test',
    "it('x', () => { expect(true).toBe(true); });",
    'Pass the value the code under test returns',
  ],
  [
    'toBeDefined names toEqual',
    "it('x', () => { expect(load()).toBeDefined(); });",
    'Assert the value itself with `toBe` or `toEqual`',
  ],
  [
    'toBeDefined names nitpicker.config.json',
    "it('x', () => { expect(load()).toBeDefined(); });",
    'exception for vitest/no-restricted-matchers in nitpicker.config.json',
  ],
  [
    'bare toHaveBeenCalled names the expected arguments',
    "it('x', () => { expect(spy).toHaveBeenCalled(); });",
    'toHaveBeenCalledWith',
  ],
  [
    'toThrow without a message names the message',
    "it('x', () => { expect(run).toThrow(); });",
    'Add an error message',
  ],
  [
    'shared let names beforeEach',
    "let calls = 0;\nit('x', () => { calls += 1; });",
    'declare it without a value and set it in `beforeEach`',
  ],
  [
    'unrestored fake timers name useRealTimers',
    "it('x', () => { vi.useFakeTimers(); });",
    'afterEach(() => { vi.useRealTimers(); })',
  ],
  ['real clock names setSystemTime', "it('x', () => { run(Date.now()); });", 'vi.setSystemTime'],
  [
    'real network in a unit test names injecting the client',
    "it('x', async () => { await fetch('http://127.0.0.1:9'); });",
    'Inject the client and fake it',
    'src/main/features/a/a.test.ts',
  ],
  [
    'copied tests name it.each',
    [1, 2, 3]
      .map((n) => `it('t${String(n)}', () => { expect(run(${String(n)})).toBe(1); });`)
      .join('\n'),
    'one `it.each` table',
  ],
  ['todo tests name writing the test', "it.todo('later');", 'write the test'],
  [
    'skipIf(true) names the platform condition',
    "it.skipIf(true)('x', () => {});",
    'process.platform',
  ],
  [
    'stryker access names testing behaviour only',
    "it('x', () => { run(globalThis.__stryker__); });",
    'Test the behaviour only',
  ],
  [
    'activeMutant access names testing behaviour only',
    "it('x', () => { run(harness.activeMutant); });",
    'Test the behaviour only',
  ],
  [
    'reading a global by a computed key names reading it by name',
    "it('x', () => { run(Reflect.get(globalThis, key)); });",
    'Read a global by its name (`globalThis.name`)',
  ],
  [
    'indexing a global by a variable names reading it by name',
    "it('x', () => { run(globalThis[key]); });",
    'Read a global by its name (`globalThis.name`)',
  ],
  [
    'an uncollected test file names the test suffix',
    "it('x', () => {});",
    'Rename it `*.test.ts`',
    'test/orders-check.ts',
  ],
  [
    'production import in a setup file names the tests that need it',
    "import { classify } from '../src/main/classify.js';\nclassify(1);",
    'Import ../src/main/classify.js in the tests that need it',
    'test/setup.ts',
  ],
  [
    'a test helper in production source names the test-support folder under the test root',
    'export const labels = [1, -1, 0];\n',
    'move it to a test-support/ folder there (test/test-support/)',
    'src/main/features/labels/testing/make-labels.ts',
  ],
  [
    'inline eslint disable in a test names the config exception',
    "/* eslint-disable */\nit('x', () => {});",
    'nitpicker config file',
  ],
];

export const testHonestyFailureMessageCases = HONESTY_ROWS.map(honestyCase);
