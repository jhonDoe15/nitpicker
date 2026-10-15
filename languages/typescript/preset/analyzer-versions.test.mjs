import { describe, expect, it } from 'vitest';
import { policyHash } from '../../../core/diff/report-model.mjs';
import {
  ESLINT_PLUGIN_PACKAGES,
  resolveAnalyzerVersion,
  resolveTestRunnerAnalyzerVersion,
} from './analyzer-versions.mjs';

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

describe('test runner analyzer versions', () => {
  const resolve = fakeResolver({ jest: '30.5.2', c8: '12.0.0', vitest: '4.1.11' });
  const node = `node@${process.versions.node}`;
  const versionFor = (analyzerName, testRunner) =>
    resolveTestRunnerAnalyzerVersion({
      analyzerName,
      projectRoot: '/project',
      testRunner,
      resolve,
    });

  it('keys the coverage version on the Jest version', () => {
    expect(versionFor('coverage', 'jest')).toBe('jest@30.5.2');
  });

  it('keys the coverage version on c8 and the Node version for node:test', () => {
    expect(versionFor('coverage', 'node-test')).toBe(`c8@12.0.0;${node}`);
  });

  it('keeps the Vitest coverage version for Vitest', () => {
    expect(versionFor('coverage', 'vitest')).toBe('4.1.11');
  });

  it('does not need Vitest installed to version a Jest project', () => {
    const jestOnly = (name) => {
      if (name === 'vitest') throw new Error('vitest is not installed');
      return { version: '30.5.2' };
    };
    expect(
      resolveTestRunnerAnalyzerVersion({
        analyzerName: 'coverage',
        projectRoot: '/project',
        testRunner: 'jest',
        resolve: jestOnly,
      }),
    ).toBe('jest@30.5.2');
  });

  it.each(['crap', 'mutation'])('adds the runner to the %s version', (analyzer) => {
    const base = resolveAnalyzerVersion(analyzer, '/project', resolve);
    expect(versionFor(analyzer, 'jest')).toBe(`${base};tests:jest@30.5.2`);
    expect(versionFor(analyzer, 'node-test')).toBe(`${base};tests:c8@12.0.0;${node}`);
    expect(versionFor(analyzer, 'vitest')).toBe(base);
  });

  it('leaves other analyzers untouched by the runner', () => {
    expect(versionFor('prettier-format', 'jest')).toBe('1.0.0');
  });
});
