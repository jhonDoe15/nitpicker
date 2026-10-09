import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../failure-messages/harness.mjs';
import { TEST_TIMEOUT_CEILING_MS } from '../eslint-plugin/rules/no-raised-test-timeout.mjs';
import { resolveLayout } from '../layout.mjs';
import { isStrictRule } from '../strict-rules.mjs';
import { strictPresetConfig } from './strict.mjs';
import strictTestsConfig, {
  strictTestConfigFor,
  strictTestHelperRules,
  strictTestRules,
} from './strict-tests.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const raisedTimeout = "it('slow', () => {}, 60_000);";
const moduleLevelArgv = 'export const [root] = process.argv.slice(2);';

function messages(code, filename, config = strictTestsConfig) {
  return failureMessagesFor({ config, filename, code });
}

describe('strict test rules', () => {
  it('apply to test files under the test roots and next to sources', () => {
    for (const file of ['test/a.test.ts', 'tests/unit/a.spec.ts', 'src/a.test.ts']) {
      expect(messages(raisedTimeout, file)).toEqual([
        expect.stringContaining('Make the test faster'),
      ]);
    }
    expect(messages(raisedTimeout, 'src/__tests__/helpers.ts')).toHaveLength(1);
  });

  it('do not apply to production code or excluded files', () => {
    expect(messages(raisedTimeout, 'src/main/service.ts')).toEqual([
      'No matching configuration found for src/main/service.ts.',
    ]);
    expect(messages(raisedTimeout, 'tests/generated/a.test.ts')).toEqual([
      'No matching configuration found for tests/generated/a.test.ts.',
    ]);
  });

  it('hold helper and fixture scripts, not test files, to the main guard', () => {
    expect(messages(moduleLevelArgv, 'tests/fixtures/fake-cli.ts')).toEqual([
      expect.stringContaining('main guard'),
    ]);
    expect(messages(moduleLevelArgv, 'tests/helpers/cli.mjs')).toHaveLength(1);
    expect(messages(moduleLevelArgv, 'tests/cli.test.ts')).toEqual([]);
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
    const configs = [
      'preset/defaults/vitest.quality.config.ts',
      'preset/defaults/stryker.vitest.config.ts',
    ];
    for (const config of configs) {
      const text = readFileSync(path.join(packageRoot, config), 'utf8');
      expect(text).toContain(
        `testTimeout: ${TEST_TIMEOUT_CEILING_MS.toLocaleString('en-US').replaceAll(',', '_')}`,
      );
    }
    const runner = readFileSync(
      path.join(packageRoot, 'adapters/diff/quality-areas-runner.mjs'),
      'utf8',
    );
    expect(runner).toContain(`'--testTimeout',\n        '${String(TEST_TIMEOUT_CEILING_MS)}'`);
  });
});
