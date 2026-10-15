import { readFileSync } from 'node:fs';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { describe, expect, it } from 'vitest';
import { policyHash } from '../../../core/diff/reporting/report-model.mjs';
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

    const packageVersion = JSON.parse(readFileSync(`${PACKAGE_ROOT}/package.json`, 'utf8')).version;
    const plugins = ESLINT_PLUGIN_PACKAGES.map((plugin) => `${plugin}@1.0.0`);
    expect(version).toBe(
      `eslint@1.0.0;typescript@1.0.0;plugins:${[...plugins, `nitpicker-plugin@${packageVersion}`].join(',')}`,
    );
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

  it('records both TypeScript versions for the type check, whichever engine runs', () => {
    expect(
      resolveAnalyzerVersion(
        'typescript-typecheck',
        '/project',
        fakeResolver({ typescript: '5.9.3', 'typescript-native': '7.0.2' }),
      ),
    ).toBe('5.9.3;typescript-native@7.0.2');
  });
});
