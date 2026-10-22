import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../eslint/normalize.mjs';
import { lintWithOxlint } from '../oxlint-runner.mjs';

const presetRoot = path.join(import.meta.dirname, '../../../preset');
const moduleUrl = (relativePath) => JSON.stringify(path.join(presetRoot, relativePath));
const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import vitest from ${JSON.stringify(import.meta.resolve('@vitest/eslint-plugin'))};
import { resolveLayout } from ${moduleUrl('layout.mjs')};
import { strictTestConfigFor } from ${moduleUrl('eslint-config/strict-tests.mjs')};
import { testHonestyConfigFor } from ${moduleUrl('eslint-config/test-honesty/index.mjs')};

const layout = resolveLayout();
export default [
  { languageOptions: { parser: tseslint.parser } },
  { files: ['**/*.test.ts'], plugins: { vitest }, rules: { 'vitest/no-disabled-tests': 'error' } },
  ...strictTestConfigFor(layout),
  ...testHonestyConfigFor(layout, { setupFiles: ['test/setup.ts'] }),
];
`;
const SOURCES = {
  'test/a.test.ts': [
    "import { expect, it, vi } from 'vitest';",
    "it.skip('skipped', () => { expect(run()).toBe(1); });",
    "it('weak', () => { expect(run()).toBeDefined(); });",
    "it('called', () => { expect(spy).toHaveBeenCalled(); });",
    "it('throws', () => { expect(run).toThrow(); });",
    "it('literal', () => { expect(run()).toBe(1); expect(true).toBe(true); });",
    "it('global', () => { expect(run(Reflect.get(globalThis, key))).toBe(1); });",
    "it.todo('later');",
    "it('timers', () => { vi.useFakeTimers(); expect(run()).toBe(1); });",
    "it('stub', () => { vi.stubGlobal('fetch', run); expect(run()).toBe(1); });",
    "it.fails('known bug', () => { expect(run()).toBe(2); });",
    '',
  ].join('\n'),
  'test/clock.test.ts': "it('clock', () => { expect(run(Date.now())).toBe(Math.random()); });\n",
  'test/state.test.ts': "let calls = 0;\nit('x', () => { calls += 1; expect(calls).toBe(1); });\n",
  'test/setup.ts':
    "import { run } from '../src/run.js';\nrun();\nvi.stubGlobal('ResizeObserver', run);\n",
  'test/types.test-d.ts': "it('types', () => { expectTypeOf(run).toBeFunction(); });\n",
  'test/orders-check.ts': "it('x', () => { expect(run()).toBe(1); });\n",
};

let root;
let findings;

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-messages-')));
  writeFileSync(path.join(root, 'policy.mjs'), POLICY);
  for (const [relativePath, text] of Object.entries(SOURCES)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
  const results = lintWithOxlint({
    options: { projectRoot: root, patterns: ['test/**/*.ts'] },
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    },
    runEslintCli: () => [],
  });
  findings = normalizeEslintResults({ value: results, projectRoot: root, analyzerName: 'lint' });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const routed = (message, rule, file) =>
  `${message} If this is intended, add {"rule":"${rule}","paths":["${file}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;

describe('test rule messages under the oxlint engine', () => {
  it('name the allowed form and the exception route', () => {
    expect(
      findings.map(({ path: file, rule, location, message }) => [
        file,
        location.line,
        rule,
        message,
      ]),
    ).toEqual(
      [
        [
          'test/a.test.ts',
          2,
          'vitest/no-disabled-tests',
          'Disabled test. Make it pass, or delete it together with the code it tests: do not skip it or mark it `todo`.',
        ],
        [
          'test/a.test.ts',
          3,
          'vitest/no-restricted-matchers',
          '`toBeDefined` passes for any value but undefined. Assert the value itself with `toBe` or `toEqual`. An exception fits only when the value cannot be pinned.',
        ],
        [
          'test/a.test.ts',
          4,
          'vitest/prefer-called-with',
          'A bare `toHaveBeenCalled()` passes for a call with any arguments. Assert them with `toHaveBeenCalledWith(...)`. An exception fits only when the arguments cannot be pinned.',
        ],
        [
          'test/a.test.ts',
          5,
          'vitest/require-to-throw-message',
          "A bare `toThrow()` passes for any error. Pass the expected message: `toThrow('the message')`. An exception fits only when the message cannot be pinned.",
        ],
        [
          'test/a.test.ts',
          6,
          'no-restricted-syntax',
          'A literal passed to `expect` can never fail. Pass the value the code under test returns.',
        ],
        [
          'test/a.test.ts',
          7,
          'no-restricted-syntax',
          'Read a global by its name (`globalThis.name`) so the test shows which global it depends on.',
        ],
        [
          'test/a.test.ts',
          8,
          'nitpicker/no-switched-off-tests',
          'Do not leave a `todo` test: write the test, or delete the stub.',
        ],
        [
          'test/a.test.ts',
          9,
          'nitpicker/fake-timers-require-restore',
          'Fake timers stay on for the tests that follow. Restore them: `afterEach(() => { vi.useRealTimers(); });`.',
        ],
        [
          'test/a.test.ts',
          10,
          'nitpicker/fake-timers-require-restore',
          'This stubbed global stays stubbed for the tests that follow. Restore it: `afterEach(() => { vi.unstubAllGlobals(); });`, or stub it once in a setup file.',
        ],
        [
          'test/clock.test.ts',
          1,
          'nitpicker/no-real-time-random-or-network',
          'The real clock makes the test depend on when it runs. Pass the time in, or fake it with `vi.useFakeTimers()` and `vi.setSystemTime(...)`.',
        ],
        [
          'test/clock.test.ts',
          1,
          'nitpicker/no-real-time-random-or-network',
          'Real randomness makes the test fail on some runs. Pass a seeded or fixed value in, or fix it with `vi.spyOn(Math, "random")`.',
        ],
        [
          'test/orders-check.ts',
          1,
          'nitpicker/no-uncollected-tests',
          'This file defines tests but the test runner does not collect it, so they never run. Rename it `*.test.ts` (or `*.spec.ts`). An exception fits only when another test file runs it on purpose.',
        ],
        [
          'test/setup.ts',
          1,
          'nitpicker/no-production-imports-in-setup-files',
          'A setup file runs before every test file, so production code imported here is covered without a test. Import ../src/run.js in the tests that need it.',
        ],
        [
          'test/state.test.ts',
          1,
          'nitpicker/no-shared-test-state',
          'Shared mutable state makes tests depend on their order. Keep `calls` inside the test, or declare it without a value and set it in `beforeEach`.',
        ],
      ].map(([file, line, rule, message]) => [file, line, rule, routed(message, rule, file)]),
    );
  });
});
