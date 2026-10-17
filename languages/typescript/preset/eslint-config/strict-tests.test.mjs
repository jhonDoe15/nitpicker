import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { depthFirst } from '../../../../shared/traversal.mjs';
import { describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../failure-messages/test-support/harness.mjs';
import { TEST_TIMEOUT_CEILING_MS } from '../eslint-plugin/rules/testing/assertions/no-raised-test-timeout.mjs';
import { TEST_TIMEOUT_MS } from '../../adapters/test-runners/test-run.mjs';
import tseslint from 'typescript-eslint';
import { resolveLayout } from '../layout.mjs';
import { defaultTestFiles } from '../test-runner/test-files/test-file-patterns.mjs';
import { isStrictRule } from '../strict-rules.mjs';
import { syntaxChildren } from '../syntax/children.mjs';
import { strictPresetConfig } from './strict.mjs';
import {
  strictTestConfigFor,
  strictTestHelperRules,
  strictTestRules,
  strictTestsConfig,
} from './strict-tests.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const raisedTimeout = "it('slow', () => {}, 60_000);";
const loopMessage =
  'for...of is the only loop; iterate the items with for...of, or give each case its own test with it.each.';
const forEachMessage = 'Use a for...of loop instead of forEach.';
const chainMessage =
  'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.' +
  ' If a framework or library requires it, add an exception for this rule for those paths in nitpicker.config.json.';
const asMessage =
  'Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.';
const angleMessage =
  'Do not assert with `<Type>value`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source.';
const moduleLevelArgv = 'export const [root] = process.argv.slice(2);';

function messages(code, filename, config = strictTestsConfig) {
  return failureMessagesFor({ config, filename, code });
}

function timeoutSettings(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(path.join(packageRoot, file), 'utf8'),
    ts.ScriptTarget.Latest,
  );
  const settings = [];
  for (const node of depthFirst(source, syntaxChildren)) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'testTimeout') {
      settings.push(['testTimeout', Number(node.initializer.getText(source).replaceAll('_', ''))]);
    }
    if (ts.isArrayLiteralExpression(node)) {
      const values = node.elements.map((element) =>
        ts.isStringLiteral(element) ? element.text : undefined,
      );
      const index = values.indexOf('--testTimeout');
      if (index !== -1) settings.push(['--testTimeout', Number(values[index + 1])]);
    }
  }
  return settings;
}

describe('strict test rules', () => {
  it('apply to test files under the test roots and next to sources', () => {
    for (const file of ['test/a.test.ts', 'tests/unit/a.spec.ts', 'src/a.test.ts']) {
      expect(messages(raisedTimeout, file)).toEqual([
        'Do not raise a test or hook timeout above 10000 ms, the testTimeout nitpicker runs tests with. Make the test faster instead: import code rather than spawning it, and share expensive setup in beforeAll. A genuinely long end-to-end suite can add an exception for this rule in nitpicker.config.json.',
      ]);
    }
    expect(messages(raisedTimeout, 'src/__tests__/helpers.ts')).toHaveLength(1);
  });

  it('do not apply to production code or excluded files', () => {
    expect(messages(raisedTimeout, 'src/main/service.ts')).toEqual([
      'No matching configuration found for src/main/service.ts.',
    ]);
    expect(messages(raisedTimeout, 'tests/node_modules/a.test.ts')).toEqual([
      'No matching configuration found for tests/node_modules/a.test.ts.',
    ]);
    expect(messages(raisedTimeout, 'tests/generated/a.test.ts')).toHaveLength(1);
  });

  it('hold helper and fixture scripts, not test files, to the main guard', () => {
    expect(messages(moduleLevelArgv, 'tests/fixtures/fake-cli.ts')).toEqual([
      'A test helper or fixture script may use process.argv only inside a main guard such as `if (import.meta.main)`. Export a function that takes the arguments and returns the exit code, and call it from the main guard, so tests can import it instead of spawning it.',
    ]);
    expect(messages(moduleLevelArgv, 'tests/helpers/cli.mjs')).toHaveLength(1);
    expect(messages(moduleLevelArgv, 'tests/cli.test.ts')).toEqual([]);
  });

  it.each([
    ['jest', '__tests__/cli.ts', 'tests/helpers/cli.ts'],
    ['node', 'test/cli-test.mjs', 'tests/helpers/cli.mjs'],
    ['mocha', 'test/cli.js', 'test/helpers/cli.js'],
  ])('treat the files %s runs as test files, not helper scripts', (runner, testFile, helper) => {
    const layout = resolveLayout({}, [], { testFiles: defaultTestFiles(runner) });
    const config = [
      { languageOptions: { parser: tseslint.parser } },
      ...strictTestConfigFor(layout),
    ];

    expect(messages(moduleLevelArgv, testFile, config)).toEqual([]);
    expect(messages(moduleLevelArgv, helper, config)).toHaveLength(1);
  });

  it.each([
    ['for(;;)', 'for (let index = 0; index < 3; index += 1) { run(index); }', loopMessage],
    ['for...in', 'for (const key in table) { run(key); }', loopMessage],
    ['while', 'while (more()) { step(); }', loopMessage],
    ['do...while', 'do { step(); } while (more());', loopMessage],
    ['forEach', 'cases.forEach(run);', forEachMessage],
    ['.then()', 'run().then(check);', chainMessage],
    ['.catch()', 'run().catch(check);', chainMessage],
    ['.finally()', 'run().finally(check);', chainMessage],
    ['as', 'export const name = lookup() as string;', asMessage],
    ['<Type>', 'export const name = <string>lookup();', angleMessage],
  ])('ban %s in test files and name the allowed form', (_name, code, message) => {
    for (const file of ['test/a.test.ts', 'src/a.spec.ts', 'tests/support/helpers.ts']) {
      expect(messages(code, file)).toEqual([message]);
    }
  });

  it('allow for...of, async/await and as const in test files', () => {
    const allowed = [
      'for (const item of items) { run(item); }',
      "it('x', async () => { await run(); });",
      "export const modes = ['a', 'b'] as const;",
    ];
    for (const code of allowed) {
      expect(messages(code, 'test/a.test.ts')).toEqual([]);
    }
  });

  it('follow the layout test roots', () => {
    const layout = resolveLayout({ testRoots: ['spec'] });
    const config = [
      { languageOptions: strictTestsConfig[0].languageOptions },
      ...strictTestConfigFor(layout),
    ];
    expect(messages(raisedTimeout, 'spec/a.test.ts', config)).toHaveLength(1);
    expect(messages(raisedTimeout, 'tests/a.test.ts', config)).toEqual([
      'No matching configuration found for tests/a.test.ts.',
    ]);
  });

  it('are part of the strict preset, so touched code is held to them', () => {
    const presetRules = strictPresetConfig(resolveLayout(), {}).flatMap((entry) =>
      Object.keys(entry.rules ?? {}),
    );
    for (const rule of Object.keys({ ...strictTestRules, ...strictTestHelperRules })) {
      expect(presetRules).toContain(rule);
      expect(isStrictRule(rule)).toBe(true);
    }
  });

  it('cap timeouts at the testTimeout nitpicker runs tests with', () => {
    expect(
      timeoutSettings('languages/typescript/preset/defaults/vitest.quality.config.ts'),
    ).toEqual([['testTimeout', TEST_TIMEOUT_CEILING_MS]]);
    expect(TEST_TIMEOUT_MS).toBe(TEST_TIMEOUT_CEILING_MS);
  });
});
