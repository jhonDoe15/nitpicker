import { describe, expect, it } from 'vitest';
import { policyHash } from '../../../core/diff/report-model.mjs';
import { ESLINT_PLUGIN_PACKAGES, resolveAnalyzerVersion } from './analyzer-versions.mjs';

function fakeResolver(overrides = {}) {
  return (name) => ({ version: overrides[name] ?? '1.0.0' });
}

function hashFor(overrides) {
  const version = resolveAnalyzerVersion('coding-standards', '/project', fakeResolver(overrides));
  return policyHash([
    { name: 'coding-standards', version, configurationHash: 'config', exclusions: [] },
  ]);
}

describe('ESLint analyzer versions', () => {
  it('records every ESLint plugin version and the nitpicker plugin version', () => {
    const version = resolveAnalyzerVersion('coding-standards', '/project', fakeResolver());

    for (const plugin of ESLINT_PLUGIN_PACKAGES) {
      expect(version).toContain(`${plugin}@1.0.0`);
    }
    expect(version).toMatch(/nitpicker-plugin@\d/);
  });

  it.each(ESLINT_PLUGIN_PACKAGES)('changes the policy hash when %s changes version', (plugin) => {
    expect(hashFor({ [plugin]: '2.0.0' })).not.toBe(hashFor({}));
  });

  it('keeps the policy hash stable when no version changes', () => {
    expect(hashFor({})).toBe(hashFor({}));
  });

  it('leaves non-ESLint analyzer versions free of plugin versions', () => {
    expect(resolveAnalyzerVersion('prettier-format', '/project', fakeResolver())).toBe('1.0.0');
  });
});
