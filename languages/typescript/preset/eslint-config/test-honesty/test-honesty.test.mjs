import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterEach, describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../../failure-messages/test-support/harness.mjs';
import { resolveLayout } from '../../layout.mjs';
import { applyRuleExceptions } from '../exceptions.mjs';
import { strictTestConfigFor } from '../strict-tests.mjs';
import { testHonestyConfigFor } from './index.mjs';
import { setupFilesIn } from './setup-files.mjs';
import { stubRestoresIn } from './stub-restores.mjs';

const layout = resolveLayout();
const parser = { languageOptions: { parser: tseslint.parser } };
const config = [
  parser,
  ...strictTestConfigFor(layout),
  ...testHonestyConfigFor(layout, { setupFiles: ['test/setup.ts'] }),
];
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function messages(code, filename = 'test/a.test.ts', used = config) {
  return failureMessagesFor({ config: used, filename, code });
}

describe('test honesty rules', () => {
  it('keep an inline eslint disable from silencing the rules', () => {
    const found = messages("/* eslint-disable */\nlet calls = 0;\nit('x', () => { calls += 1; });");

    expect(found).toEqual([
      "'/* eslint-disable */' has no effect because you have 'noInlineConfig' setting in your config.",
      'Fix the violation; inline ESLint disables are not allowed. A reviewed exception belongs in the nitpicker config file.',
      'Shared mutable state makes tests depend on their order. Keep `calls` inside the test, or declare it without a value and set it in `beforeEach`.',
    ]);
  });

  it('allow ordinary comments, pinned values and restored fake timers in tests', () => {
    const code = [
      '// the second argument is the amount in cents',
      'afterEach(() => { vi.useRealTimers(); });',
      "it('x', () => { vi.useFakeTimers(); vi.setSystemTime(0); expect(Date.now()).toBe(0); });",
      "it('y', () => { expect(make()).toEqual({ id: 1 }); expect(spy).toHaveBeenCalledWith(1); });",
      "it('z', () => { expect(run).toThrow('bad input'); expect(make()).toBeUndefined(); });",
      "it.skipIf(process.platform === 'win32')('w', () => {});",
      "it('v', () => { expect(Reflect.get(store, 'total')).toBe(1); });",
    ].join('\n');

    expect(messages(code)).toEqual([]);
  });

  it('require restoring a global stubbed in a test file, not in a setup file', () => {
    const stub = "vi.stubGlobal('ResizeObserver', class {});";

    expect(messages(stub, 'test/setup.ts')).toEqual([]);
    expect(messages(`it('x', () => { ${stub} expect(run()).toBe(1); });`)).toEqual([
      'This stubbed global stays stubbed for the tests that follow. Restore it: `afterEach(() => { vi.unstubAllGlobals(); });`, or stub it once in a setup file.',
    ]);
  });

  it('hold test helpers to the same rules and leave production code alone', () => {
    expect(messages('export let counter = 0;', 'test/helpers/state.ts')).toHaveLength(1);
    expect(messages('export let counter = 0;', 'src/main/state.ts')).toEqual([]);
  });

  it('keep test helpers out of production source and name the test folder', () => {
    const code = 'export const labels = [1, -1, 0];';

    expect(messages(code, 'src/main/features/labels/testing/make-labels.ts')).toEqual([
      'This looks like a test helper (testing/), but it sits in production source, so it is mutation-tested and shipped. Tests in this project live under test/, so move it to a test-support/ folder there (test/test-support/). An exception fits only when it is real production code.',
    ]);
    expect(messages(code, 'src/main/features/labels/test-support/make-labels.ts')).toEqual([
      'This looks like a test helper (test-support/), but it sits in production source, so it is mutation-tested and shipped. Tests in this project live under test/, so move it to a test-support/ folder there (test/test-support/). An exception fits only when it is real production code.',
    ]);
    expect(messages(code, 'src/main/features/labels/domain/labels.ts')).toEqual([]);
    expect(messages(code, 'test/support/make-labels.ts')).toEqual([]);
  });

  it('allow test-support/ next to the code in a colocated layout, and name it', () => {
    const code = 'export const labels = [1, -1, 0];';
    const colocated = [parser, ...testHonestyConfigFor(resolveLayout({ colocatedTests: true }))];

    expect(
      messages(code, 'src/main/features/labels/test-support/make-labels.ts', colocated),
    ).toEqual([]);
    expect(messages(code, 'src/main/test-support/fixtures/labels.ts', colocated)).toEqual([]);
    expect(messages(code, 'src/main/features/labels/testing/make-labels.ts', colocated)).toEqual([
      'This looks like a test helper (testing/), but it sits in production source outside a test-support/ folder. Tests in this project sit next to the code, and test-only modules go in a test-support/ folder beside the code they serve: move it there. An exception fits only when it is real production code.',
    ]);
  });

  it('keep the real network out of unit tests only', () => {
    const code = "it('x', async () => { await fetch('http://127.0.0.1:9'); });";

    const networkMessage = 'A unit test must not reach the network. Inject the client and fake it.';

    expect(messages(code, 'src/main/features/a/__tests__/a.test.ts')).toEqual([networkMessage]);
    expect(messages(code, 'src/main/features/a/a.test.ts')).toEqual([networkMessage]);
    expect(messages(code, 'test/api.test.ts')).toEqual([]);
  });

  it('report tests in a file the runner does not collect, but not in test files', () => {
    const code = "it('ships express in 2 days', () => { expect(days('express')).toBe(2); });";

    expect(messages(code, 'test/orders-check.ts')).toEqual([
      'This file defines tests but is not named like a test file, so they never run. Rename it `*.test.ts` (or `*.spec.ts`). An exception fits only when another test file runs it on purpose.',
    ]);
    expect(messages(code, 'test/orders.test.ts')).toEqual([]);
  });

  it('keep production code out of the setup files', () => {
    const code = "import { classify } from '../src/main/classify.js';\nclassify(1);";

    expect(messages(code, 'test/setup.ts')).toEqual([
      'A setup file runs before every test file, so production code imported here is covered without a test. Import ../src/main/classify.js in the tests that need it.',
    ]);
    expect(messages(code, 'test/helpers/build.ts')).toEqual([]);
  });

  it('are switched off per path by an exception in nitpicker.config.json', () => {
    const excepted = applyRuleExceptions(config, [
      {
        rule: 'nitpicker/no-shared-test-state',
        paths: ['test/legacy.test.ts'],
        reason: 'legacy',
      },
    ]);
    const code = "let calls = 0;\nit('x', () => { calls += 1; });";

    expect(messages(code, 'test/legacy.test.ts', excepted)).toEqual([]);
    expect(messages(code, 'test/other.test.ts', excepted)).toHaveLength(1);
  });

  it('follow the layout test roots', () => {
    const custom = [
      parser,
      ...strictTestConfigFor(resolveLayout({ testRoots: ['spec'] })),
      ...testHonestyConfigFor(resolveLayout({ testRoots: ['spec'] })),
    ];
    const code = "it('x', () => { expect(true).toBe(true); });";

    expect(messages(code, 'spec/a.test.ts', custom)).toHaveLength(1);
    expect(messages(code, 'test/a.test.ts', custom)).toEqual([
      'No matching configuration found for test/a.test.ts.',
    ]);
  });
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-setup-files-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

describe('setup files named by the project vitest config', () => {
  it('reads setupFiles and globalSetup, as arrays or single strings', () => {
    const root = projectWith({
      'vitest.config.ts': [
        'export default defineConfig({ test: {',
        '  setupFiles: [\'./test/setup.ts\', "test/more.setup.ts"],',
        "  globalSetup: './test/global.ts',",
        '} });',
      ].join('\n'),
    });

    expect(setupFilesIn(root)).toEqual(['test/setup.ts', 'test/more.setup.ts', 'test/global.ts']);
  });

  it('ignores package entries and finds a Vite config when there is no Vitest config', () => {
    const root = projectWith({
      'vite.config.mjs':
        "export default { test: { setupFiles: ['@testing-library/jest-dom/vitest', './s.mjs'] } };",
    });

    expect(setupFilesIn(root)).toEqual(['s.mjs']);
  });

  it('finds nothing without a config or without setup options', () => {
    expect(setupFilesIn(projectWith({}))).toEqual([]);
    expect(
      setupFilesIn(projectWith({ 'vitest.config.ts': 'export default { test: {} };' })),
    ).toEqual([]);
  });
});

describe('stub restores the project vitest config switches on', () => {
  const restores = (scope, globals, envs) => ({ scope, globals, envs });

  it.each([
    [
      'unstubGlobals for the whole project',
      { 'vitest.config.ts': 'export default defineConfig({ test: { unstubGlobals: true } });' },
      [restores('.', true, false)],
    ],
    [
      'unstubEnvs for the whole project',
      {
        'vite.config.mjs': "export default { test: { 'unstubEnvs': true, unstubGlobals: false } };",
      },
      [restores('.', false, true)],
    ],
    [
      'both in an inline test.projects entry with its own root',
      {
        'vitest.config.ts': [
          'export default { test: { projects: [',
          "  { test: { name: 'web', root: './packages/web', unstubGlobals: true, unstubEnvs: true } },",
          "  { test: { name: 'api', root: 'packages/api' } },",
          '] } };',
        ].join('\n'),
      },
      [restores('packages/web', true, true)],
    ],
    [
      'unstubGlobals in the config of a path or glob test.projects entry',
      {
        'vitest.config.ts':
          "export default { test: { projects: ['packages/*', '!packages/old'] } };",
        'packages/web/vitest.config.ts': 'export default { test: { unstubGlobals: true } };',
        'packages/api/vitest.config.ts': 'export default { test: { unstubGlobals: false } };',
      },
      [restores('packages/web', true, false)],
    ],
  ])('reads %s', (_name, files, expected) => {
    expect(stubRestoresIn(projectWith(files))).toEqual(expected);
  });

  it('turn the stub check off where the project config restores stubs itself', () => {
    const scoped = [
      parser,
      ...testHonestyConfigFor(layout, {
        stubRestores: [restores('.', true, false), restores('test/web', true, true)],
      }),
    ];
    const code = "it('x', () => { vi.stubGlobal('fetch', run); vi.stubEnv('MODE', 'x'); });";

    expect(messages(code, 'test/a.test.ts', scoped)).toEqual([
      'This stubbed environment variable stays set for the tests that follow. Restore it: `afterEach(() => { vi.unstubAllEnvs(); });`.',
    ]);
    expect(messages(code, 'test/web/a.test.ts', scoped)).toEqual([]);
  });
});
