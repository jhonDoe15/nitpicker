import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterEach, describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../../failure-messages/harness.mjs';
import { resolveLayout } from '../../layout.mjs';
import { applyRuleExceptions } from '../exceptions.mjs';
import { strictTestConfigFor } from '../strict-tests.mjs';
import { testHonestyConfigFor } from './index.mjs';
import { setupFilesIn } from './setup-files.mjs';

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
  it.each([
    ['literal subject', "it('x', () => { expect(true).toBe(true); });", 'can never fail'],
    ['toBeDefined', "it('x', () => { expect(make()).toBeDefined(); });", '`toBeDefined` passes'],
    ['toBeTruthy', "it('x', () => { expect(make()).toBeTruthy(); });", '`toBeTruthy` passes'],
    ['not.toBeNull', "it('x', () => { expect(make()).not.toBeNull(); });", '`not.toBeNull`'],
    [
      'resolves.toBeDefined',
      "it('x', async () => { await expect(p).resolves.toBeDefined(); });",
      '`toBeDefined`',
    ],
    [
      'bare toHaveBeenCalled',
      "it('x', () => { expect(spy).toHaveBeenCalled(); });",
      'toHaveBeenCalledWith',
    ],
    [
      'toThrow without message',
      "it('x', () => { expect(run).toThrow(); });",
      'Add an error message',
    ],
    ['module-level let', "let calls = 0;\nit('x', () => { calls += 1; });", 'beforeEach'],
    [
      'stryker global',
      "it('x', () => { Reflect.get(globalThis, '__stryker__'); });",
      'mutation harness',
    ],
    ['stryker identifier', "it('x', () => { run(STRYKER_ACTIVE_MUTANT); });", 'mutation harness'],
    ['todo', "it.todo('later');", 'delete the stub'],
    ['fails', "it.fails('x', () => { expect(run()).toBe(2); });", 'correct behaviour'],
    ['skipIf(true)', "it.skipIf(true)('x', () => {});", 'switches the test off for good'],
    ['fake timers', "it('x', () => { vi.useFakeTimers(); });", 'vi.useRealTimers()'],
    ['real clock', "it('x', () => { run(Date.now()); });", 'vi.setSystemTime'],
    ['real randomness', "it('x', () => { run(Math.random()); });", 'seeded or fixed'],
    [
      'copied tests',
      [1, 2, 3]
        .map((n) => `it('t${String(n)}', () => { expect(run(${String(n)})).toBe(${String(n)}); });`)
        .join('\n'),
      'it.each',
    ],
    [
      'an inline eslint disable',
      "/* eslint-disable */\nit('x', () => {});",
      'nitpicker config file',
    ],
    ['@ts-expect-error', '// @ts-expect-error\nrun(1);', 'Fix the type error'],
    ['a Stryker comment', "// Stryker disable all\nit('x', () => {});", 'Test this code instead'],
  ])('name the allowed form for %s', (_name, code, allowed) => {
    expect(messages(code).join('\n')).toContain(allowed);
  });

  it('name the exception route in nitpicker.config.json where the form can be legitimate', () => {
    for (const code of [
      "it('x', () => { expect(make()).toBeDefined(); });",
      "let calls = 0;\nit('x', () => { calls += 1; });",
      "it.todo('later');",
      "it('x', () => { vi.useFakeTimers(); });",
      "it('x', () => { run(Date.now()); });",
    ]) {
      expect(messages(code).join('\n')).toContain('nitpicker.config.json');
    }
  });

  it('keep an inline eslint disable from silencing the rules', () => {
    const found = messages("/* eslint-disable */\nlet calls = 0;\nit('x', () => { calls += 1; });");

    expect(found.some((text) => text.includes('Shared mutable state'))).toBe(true);
  });

  it('allow ordinary comments, pinned values and restored fake timers in tests', () => {
    const code = [
      '// the second argument is the amount in cents',
      'afterEach(() => { vi.useRealTimers(); });',
      "it('x', () => { vi.useFakeTimers(); vi.setSystemTime(0); expect(Date.now()).toBe(0); });",
      "it('y', () => { expect(make()).toEqual({ id: 1 }); expect(spy).toHaveBeenCalledWith(1); });",
      "it('z', () => { expect(run).toThrow('bad input'); expect(make()).toBeUndefined(); });",
      "it.skipIf(process.platform === 'win32')('w', () => {});",
    ].join('\n');

    expect(messages(code)).toEqual([]);
  });

  it('hold test helpers to the same rules and leave production code alone', () => {
    expect(messages('export let counter = 0;', 'test/helpers/state.ts')).toHaveLength(1);
    expect(messages('export let counter = 0;', 'src/main/state.ts')).toEqual([
      'No matching configuration found for src/main/state.ts.',
    ]);
  });

  it('keep the real network out of unit tests only', () => {
    const code = "it('x', async () => { await fetch('http://127.0.0.1:9'); });";

    expect(messages(code, 'src/main/features/a/__tests__/a.test.ts').join('\n')).toContain(
      'must not reach the network',
    );
    expect(messages(code, 'src/main/features/a/a.test.ts').join('\n')).toContain(
      'must not reach the network',
    );
    expect(messages(code, 'test/api.test.ts')).toEqual([]);
  });

  it('report tests in a file the runner does not collect, but not in test files', () => {
    const code = "it('ships express in 2 days', () => { expect(days('express')).toBe(2); });";

    expect(messages(code, 'test/orders-check.ts').join('\n')).toContain('never run');
    expect(messages(code, 'test/orders.test.ts')).toEqual([]);
  });

  it('keep production code out of the setup files', () => {
    const code = "import { classify } from '../src/main/classify.js';\nclassify(1);";

    expect(messages(code, 'test/setup.ts').join('\n')).toContain('covered without a test');
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
