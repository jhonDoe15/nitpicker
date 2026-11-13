import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPythonAnalyzers } from '../../../languages/python/adapters/python-analyzer.mjs';
import { KOTLIN_FORMATTERS } from '../../../languages/java/adapters/style/jvm-formatters.mjs';
import { GO_LINT_TOOLS } from '../../../languages/go/adapters/configuration/go-config.mjs';
import { JAVA_TOOLS } from '../../../languages/java/adapters/gradle-presets.mjs';
import { PRESET_TOOLS } from '../../../shared/exceptions/rule-tools.mjs';
import { SUPPORTED_PRESETS } from '../validate.mjs';
import { toolSettingKeysOf } from '../tool-settings.mjs';
import { precedenceExemption, precedenceExemptions } from './precedence-exempt-tools.mjs';

const EXTERNAL_TOOLS = {
  typescript: ['oxlint', 'eslint', 'prettier', 'knip', 'dependency-cruiser', 'stryker', 'vitest'],
  javascript: ['oxlint', 'eslint', 'prettier', 'knip', 'dependency-cruiser', 'stryker', 'vitest'],
  java: JAVA_TOOLS,
  kotlin: [...JAVA_TOOLS, ...Object.keys(KOTLIN_FORMATTERS), 'detekt', 'kotlin-source', 'kotlinc'],
  python: [...new Set(createPythonAnalyzers().flatMap(({ reportedTools }) => reportedTools))],
  go: [...GO_LINT_TOOLS, 'gofumpt', 'goimports'],
};

function nativeTools(preset) {
  return [...new Set([...EXTERNAL_TOOLS[preset], ...PRESET_TOOLS[preset]])];
}

function isExemptIn(tool, preset) {
  return precedenceExemption(tool)?.presets.includes(preset) === true;
}

describe('tool precedence coverage', () => {
  it.each(SUPPORTED_PRESETS)('lets every accepted %s tool list a precedence', (preset) => {
    const without = [...toolSettingKeysOf(preset)]
      .filter(([, keys]) => !keys.includes('precedence'))
      .map(([tool]) => tool);
    expect(without).toEqual([]);
  });

  it.each(SUPPORTED_PRESETS)(
    'gives every listed tool of the %s preset a precedence or a reason it has none',
    (preset) => {
      const accepted = new Set(toolSettingKeysOf(preset).keys());
      const unexplained = nativeTools(preset).filter(
        (tool) => !(accepted.has(tool) || isExemptIn(tool, preset)),
      );
      expect(unexplained).toEqual([]);
    },
  );

  it('never lists a tool as exempt in a preset that accepts it under "tools"', () => {
    const both = SUPPORTED_PRESETS.flatMap((preset) =>
      [...toolSettingKeysOf(preset).keys()]
        .filter((tool) => isExemptIn(tool, preset))
        .map((tool) => `${preset}:${tool}`),
    );
    expect(both).toEqual([]);
  });

  describe('documentation', () => {
    const usage = readFileSync(new URL('../../../docs/usage.md', import.meta.url), 'utf8');
    const exemptions = precedenceExemptions();

    it('gives every exempt tool a reason', () => {
      const brief = exemptions
        .filter(([, { reason }]) => reason.length <= 20)
        .map(([tool]) => tool);
      expect(brief).toEqual([]);
    });

    it('names every exempt tool in the usage guide', () => {
      const missing = exemptions
        .filter(([tool]) => !usage.includes(`\`${tool}\``))
        .map(([tool]) => tool);
      expect(missing).toEqual([]);
    });

    it('has a section for the tools without a precedence', () => {
      expect(usage.includes('Tools without a `precedence`')).toBe(true);
    });
  });
});
