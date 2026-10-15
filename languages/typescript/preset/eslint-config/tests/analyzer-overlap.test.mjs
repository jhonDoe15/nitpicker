import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { eslintChecks } from '../../quality-checks.mjs';

const packageRoot = path.resolve(new URL('../', import.meta.url).pathname, '../../../..');
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

  it('still reports no-silent-catch for adapters, through eslint-errors', async () => {
    const byRule = await errorRulesByAnalyzer('src/main/features/orders/adapters/store.ts');

    expect(byRule.get('nitpicker/no-silent-catch')).toEqual(['eslint-errors']);
  });
});
