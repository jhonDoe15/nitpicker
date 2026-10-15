import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { eslintChecks } from '../../quality-checks.mjs';
import { strictEslintRuleIds } from '../../strict-rules.mjs';
import { codeSmellProductionRules } from './code-smell-rules.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
const CODE_SMELL_RULES = [
  ...Object.keys(codeSmellProductionRules),
  'nitpicker/no-hardcoded-secret',
];

async function enabledRules(file) {
  const rules = new Set();
  for (const { configRelativePath } of eslintChecks) {
    const eslint = new ESLint({
      cwd: packageRoot,
      overrideConfigFile: path.join(packageRoot, configRelativePath),
    });
    const calculated = await eslint.calculateConfigForFile(path.join(packageRoot, file));
    for (const [rule, setting] of Object.entries(calculated?.rules ?? {})) {
      const severity = Array.isArray(setting) ? setting[0] : setting;
      if (severity === 2 || severity === 'error') {
        rules.add(rule);
      }
    }
  }
  return rules;
}

describe('code smell rules', () => {
  it('are enabled for production files', async () => {
    const rules = await enabledRules('src/main/features/orders/adapters/store.ts');

    expect(CODE_SMELL_RULES.filter((rule) => !rules.has(rule))).toEqual([]);
  });

  it('are not enabled for test files', async () => {
    const rules = await enabledRules('test/orders.test.ts');

    expect(CODE_SMELL_RULES.filter((rule) => rules.has(rule))).toEqual([]);
  });

  it('keep only the hardcoded secret rule strict', () => {
    const strictGuards = CODE_SMELL_RULES.filter((rule) => strictEslintRuleIds.includes(rule));

    expect(strictGuards).toEqual(['nitpicker/no-hardcoded-secret']);
  });
});
