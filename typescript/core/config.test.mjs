import { describe, expect, it } from 'vitest';
import { applyDisable, describeConfigOverrides, validateConfig } from './config.mjs';
import { policyHash } from './diff/report-model.mjs';

describe('config file', () => {
  it('accepts an empty config and the documented keys', () => {
    expect(validateConfig({})).toEqual({});
    expect(
      validateConfig({
        base: 'origin/develop',
        preset: 'typescript',
        disable: ['knip'],
        thresholds: { crapLimit: 12 },
        exclude: ['generated/**'],
        layout: { sourceRoots: ['lib'], testRoots: ['spec', 'tests'] },
        analyzers: [{ name: 'custom', command: './check.sh', args: ['--json'] }],
      }),
    ).toBeDefined();
  });

  it.each([
    [[], /must be a JSON object/],
    [{ disable: 'knip' }, /"disable" must be an array/],
    [{ disable: ['a', 'a'] }, /duplicates/],
    [{ thresholds: { crapLimit: 0 } }, /positive number/],
    [{ exclude: [1] }, /"exclude" must be an array/],
    [{ layout: [] }, /"layout" must be an object/],
    [{ layout: { source: ['lib'] } }, /unknown layout key "source"/],
    [{ layout: { sourceRoots: 'lib' } }, /"layout.sourceRoots" must be an array/],
    [{ layout: { sourceRoots: [] } }, /"layout.sourceRoots" must not be empty/],
    [{ layout: { testRoots: ['../spec'] } }, /entries must be directories inside the project/],
    [{ layout: { sourceRoots: ['/abs'] } }, /entries must be directories inside the project/],
    [{ layout: { sourceRoots: ['lib/**'] } }, /entries must be directories inside the project/],
    [{ analyzers: [{ name: 'a', command: 'b', extra: 1 }] }, /unknown key "extra"/],
  ])('rejects %j', (config, message) => {
    expect(() => validateConfig(config)).toThrow(message);
  });

  it('describes overrides in a stable key order', () => {
    expect(describeConfigOverrides({ thresholds: { crapLimit: 12 }, base: 'main' })).toEqual([
      'base: "main"',
      'thresholds: {"crapLimit":12}',
    ]);
  });

  it('refuses to disable an analyzer that another enabled analyzer depends on', () => {
    const analyzers = [{ name: 'coverage' }, { name: 'crap', dependencies: ['coverage'] }];

    expect(() => applyDisable(analyzers, { disable: ['coverage'] })).toThrow(/depends on it/);
    expect(applyDisable(analyzers, { disable: ['coverage', 'crap'] })).toEqual([]);
  });

  it('keeps the zero-config policy hash and changes it for any override', () => {
    const analyzers = [{ name: 'a', version: '1', configurationHash: 'h' }];

    expect(policyHash(analyzers, [])).toBe(policyHash(analyzers));
    expect(policyHash(analyzers, ['base: "x"'])).not.toBe(policyHash(analyzers));
  });
});
