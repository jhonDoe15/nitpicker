import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { eslintChecks } from '../../quality-checks.mjs';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)), '../../../..');
const ANALYZER_CONFIGS = Object.fromEntries(
  eslintChecks.map(({ name, configRelativePath }) => [name, configRelativePath]),
);
const SAMPLE_FILES = [
  'src/main/features/orders/adapters/store.ts',
  'src/main/features/orders/domain/price.ts',
  'src/main/features/orders/index.ts',
  'src/main/composition-root.ts',
  'src/main/shared/clock.ts',
  'test/orders.test.ts',
];

async function errorRulesByAnalyzer(file) {
  const byRule = new Map();
  for (const [analyzer, config] of Object.entries(ANALYZER_CONFIGS)) {
    const eslint = new ESLint({
      cwd: packageRoot,
      overrideConfigFile: path.join(packageRoot, config),
    });
    const calculated = await eslint.calculateConfigForFile(path.join(packageRoot, file));
    for (const [rule, setting] of Object.entries(calculated?.rules ?? {})) {
      const severity = Array.isArray(setting) ? setting[0] : setting;
      if (severity === 2 || severity === 'error') {
        byRule.set(rule, [...(byRule.get(rule) ?? []), analyzer]);
      }
    }
  }
  return byRule;
}

describe('ESLint analyzers do not report the same rule on the same file', () => {
  it.each(SAMPLE_FILES)('%s', async (file) => {
    const byRule = await errorRulesByAnalyzer(file);
    const shared = [...byRule].filter(([, analyzers]) => analyzers.length > 1);

    expect(shared).toEqual([]);
  });

  it.each(SAMPLE_FILES)('owns atomic updates once for %s', async (file) => {
    const byRule = await errorRulesByAnalyzer(file);
    expect(byRule.get('require-atomic-updates')).toEqual(['eslint-lint']);
  });

  it('pins property checking in the effective preset', async () => {
    const eslint = new ESLint({
      cwd: packageRoot,
      overrideConfigFile: path.join(packageRoot, ANALYZER_CONFIGS['eslint-lint']),
    });
    const calculated = await eslint.calculateConfigForFile(path.join(packageRoot, SAMPLE_FILES[0]));
    expect(calculated.rules['require-atomic-updates']).toEqual([2, { allowProperties: false }]);
  });

  it('still reports no-silent-catch for adapters, through eslint-errors', async () => {
    const byRule = await errorRulesByAnalyzer('src/main/features/orders/adapters/store.ts');

    expect(byRule.get('nitpicker/no-silent-catch')).toEqual(['eslint-errors']);
  });
});

const TEST_AREA_RULES = [
  'nitpicker/no-fixed-sleep-synchronization',
  'nitpicker/no-interval-polling-in-tests',
  'nitpicker/no-wait-for-with-fake-timers',
  'nitpicker/no-partial-output-assertion',
];

describe('test-area rules reach every test-area file', () => {
  it.each([
    'tests/e2e/checkout.spec.ts',
    'tests/unit/panel.test.tsx',
    'src/main/features/orders/orders.test.ts',
    'src/main/features/orders/__tests__/helpers.ts',
  ])('%s', async (file) => {
    const byRule = await errorRulesByAnalyzer(file);

    expect(TEST_AREA_RULES.map((rule) => byRule.get(rule))).toEqual(
      TEST_AREA_RULES.map(() => ['eslint-lint']),
    );
  });

  it('stays off production files', async () => {
    const byRule = await errorRulesByAnalyzer('src/main/features/orders/index.ts');

    expect(TEST_AREA_RULES.filter((rule) => byRule.has(rule))).toEqual([]);
  });
});
