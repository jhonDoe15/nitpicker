import path from 'node:path';
import { ESLint, type Linter } from 'eslint';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eslintChecks } from '../../quality-checks.mjs';
import { fileURLToPath } from 'node:url';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { CARRIED_VARIABLE, productionPolicy } from '../production/carried-policies.mts';
import { checkoutModulePath } from '../../../../../shared/paths/checkout-module.mjs';

const packageRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)), '../../../..');
const ANALYZER_CONFIGS = new Map(
  eslintChecks.map(({ name, configRelativePath }): [string, string] => [
    textOf(name),
    textOf(configRelativePath),
  ]),
);
const sourcePath: (file: string) => string = checkoutModulePath;
const FIRST_SAMPLE = 'src/main/features/orders/adapters/store.ts';

function policyConfigFile(analyzer: string): string {
  return sourcePath(path.join(packageRoot, ANALYZER_CONFIGS.get(analyzer) ?? ''));
}
const SAMPLE_FILES = [
  FIRST_SAMPLE,
  'src/main/features/orders/domain/price.ts',
  'src/main/features/orders/index.ts',
  'src/main/composition-root.ts',
  'src/main/shared/clock.ts',
  'test/orders.test.ts',
];

async function errorRulesByAnalyzer(file: string) {
  const byRule = new Map<string, string[]>();
  for (const analyzer of ANALYZER_CONFIGS.keys()) {
    const eslint = new ESLint({
      cwd: packageRoot,
      overrideConfigFile: policyConfigFile(analyzer),
    });
    const calculated: unknown = await eslint.calculateConfigForFile(path.join(packageRoot, file));
    for (const [rule, setting] of Object.entries(fieldsOf(fieldOf(calculated, 'rules')))) {
      const severity = Array.isArray(setting) ? listOf(setting)[0] : setting;
      if (severity === 2 || severity === 'error') {
        byRule.set(rule, [...(byRule.get(rule) ?? []), analyzer]);
      }
    }
  }
  return byRule;
}

const CARRIED = ['eslint-errors', 'eslint-logging', 'eslint-module-effects'];
const CARRIED_RULES = CARRIED.flatMap((name) => Object.keys(productionPolicy(name).rules));
function configsOf(value: unknown): Linter.Config[] {
  return listOf(value).map((entry) => fieldsOf(entry));
}

function severityOf(setting: unknown): unknown {
  return Array.isArray(setting) ? [listOf(setting)[0], ...listOf(setting).slice(1)] : [setting];
}

function carriedSettings(rules: unknown) {
  return CARRIED_RULES.map((rule) => [rule, severityOf(fieldOf(rules, rule) ?? 0)]);
}

async function lintSettings(carried: string): Promise<unknown[]> {
  vi.stubEnv(CARRIED_VARIABLE, carried);
  vi.resetModules();
  const loaded: unknown = await import(policyConfigFile('eslint-lint'));
  const eslint = new ESLint({
    cwd: packageRoot,
    overrideConfigFile: true,
    overrideConfig: configsOf(fieldOf(loaded, 'default')),
  });
  const settings: unknown[] = [];
  for (const file of SAMPLE_FILES) {
    const calculated: unknown = await eslint.calculateConfigForFile(path.join(packageRoot, file));
    settings.push(carriedSettings(fieldOf(calculated, 'rules')));
  }
  return settings;
}

function standaloneLinters(): ESLint[] {
  return CARRIED.map(
    (name) => new ESLint({ cwd: packageRoot, overrideConfigFile: policyConfigFile(name) }),
  );
}

async function standaloneSettings(linters: readonly ESLint[], file: string) {
  const rules: Record<string, unknown> = {};
  for (const eslint of linters) {
    const calculated: unknown = await eslint.calculateConfigForFile(path.join(packageRoot, file));
    Object.assign(rules, fieldsOf(fieldOf(calculated, 'rules') ?? {}));
  }
  return carriedSettings(rules);
}

describe('eslint-lint carrying the production policy analyzers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  let carried: unknown[];

  beforeAll(async () => {
    carried = await lintSettings(CARRIED.join(','));
  });

  it('sets their rules as they set them, file by file', async () => {
    const linters = standaloneLinters();

    expect(carried).toEqual(
      await Promise.all(SAMPLE_FILES.map((file) => standaloneSettings(linters, file))),
    );
  });

  it('carries only the analyzers it is given', async () => {
    const settings = await lintSettings('eslint-errors');

    expect(settings[0]).toEqual([
      ['nitpicker/no-silent-catch', [2]],
      ['nitpicker/no-production-console', [0]],
      ['nitpicker/structured-catch-logging', [0]],
      ['nitpicker/report-module-load-effects', [0]],
    ]);
  });
});

describe('ESLint analyzers do not report the same rule on the same file', () => {
  it.each(SAMPLE_FILES)('%s', async (file) => {
    const byRule = await errorRulesByAnalyzer(file);
    const shared = [...byRule].filter(([, analyzers]) => analyzers.length > 1);

    expect(shared).toEqual([]);
  });

  it.each(SAMPLE_FILES)('owns atomic updates once for %s', async (file) => {
    const byRule = await errorRulesByAnalyzer(file);
    expect(byRule.get('nitpicker/require-atomic-updates')).toEqual(['eslint-lint']);
  });

  it('pins property checking in the effective preset', async () => {
    const eslint = new ESLint({
      cwd: packageRoot,
      overrideConfigFile: policyConfigFile('eslint-lint'),
    });
    const calculated: unknown = await eslint.calculateConfigForFile(
      path.join(packageRoot, FIRST_SAMPLE),
    );
    expect(fieldOf(fieldOf(calculated, 'rules'), 'nitpicker/require-atomic-updates')).toEqual([
      2,
      { allowProperties: false },
    ]);
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
