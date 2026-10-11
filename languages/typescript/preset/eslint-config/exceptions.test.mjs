import { ESLint } from 'eslint';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../head-policy.mjs';
import presetConfig from '../defaults/eslint.config.mjs';
import errorsConfig from './errors.mjs';
import { applyMatchingRuleExceptions, applyRuleExceptions } from './exceptions.mjs';

const rule = 'nitpicker/preserve-error-cause';
const exception = { rule, paths: ['src/legacy/**'], reason: 'Legacy rewrite' };

async function ruleSeverity(config, file, name = rule) {
  const eslint = new ESLint({
    cwd: path.resolve(import.meta.dirname, '../defaults'),
    overrideConfigFile: true,
    overrideConfig: config,
  });
  const result = await eslint.calculateConfigForFile(file);
  return result.rules[name]?.[0];
}

describe('strict rule exceptions', () => {
  it('turns the rule off only for the configured paths', async () => {
    const config = applyRuleExceptions(presetConfig, [exception]);
    await expect(ruleSeverity(config, 'src/legacy/old.ts')).resolves.toBe(0);
    await expect(ruleSeverity(config, 'src/fresh/new.ts')).resolves.toBe(2);
  });

  it('leaves the config untouched without exceptions', () => {
    expect(applyRuleExceptions(presetConfig, [])).toEqual(presetConfig);
  });

  it('fails for a rule the preset does not define', () => {
    expect(() =>
      applyRuleExceptions(presetConfig, [{ ...exception, rule: 'nitpicker/nope' }]),
    ).toThrow(/unknown rules: nitpicker\/nope/);
  });

  it('lifts a rule in a narrower production analyzer and ignores rules it does not run', async () => {
    const silentCatch = 'nitpicker/no-silent-catch';
    const config = applyMatchingRuleExceptions(errorsConfig, [
      { rule: silentCatch, paths: ['src/legacy/**'], reason: 'Legacy rewrite' },
      { rule: 'sonarjs/cognitive-complexity', paths: ['src/legacy/**'], reason: 'Lint only' },
    ]);
    await expect(ruleSeverity(config, 'src/legacy/old.ts', silentCatch)).resolves.toBe(0);
    await expect(ruleSeverity(config, 'src/fresh/new.ts', silentCatch)).resolves.toBe(2);
  });

  it('travels through the head policy', () => {
    expect(resolveHeadPolicy({ exceptions: [exception] }).exceptions).toEqual([exception]);
  });
});
