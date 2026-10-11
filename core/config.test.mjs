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

  it('accepts the java and kotlin presets and rejects other presets', () => {
    expect(validateConfig({ preset: 'java' })).toEqual({ preset: 'java' });
    expect(validateConfig({ preset: 'kotlin' })).toEqual({ preset: 'kotlin' });
    expect(() => validateConfig({ preset: 'cobol' })).toThrow(
      '"preset" must be one of: typescript, java, kotlin',
    );
  });

  describe('kotlin options', () => {
    it('accepts a formatter with the kotlin preset', () => {
      const config = { preset: 'kotlin', kotlin: { formatter: 'ktfmt' } };
      expect(validateConfig(config)).toEqual(config);
      expect(validateConfig({ preset: 'kotlin', kotlin: {} })).toBeDefined();
    });

    it.each([
      [{ preset: 'kotlin', kotlin: { formatter: 'prettier' } }, /must be one of: ktlint, ktfmt/],
      [{ preset: 'kotlin', kotlin: { style: 'google' } }, /unknown key "kotlin.style"/],
      [{ preset: 'kotlin', kotlin: 'ktlint' }, /"kotlin" must be an object/],
      [
        { preset: 'java', kotlin: { formatter: 'ktlint' } },
        /only supported with "preset": "kotlin"/,
      ],
      [{ kotlin: { formatter: 'ktlint' } }, /only supported with "preset": "kotlin"/],
    ])('rejects %j', (config, message) => {
      expect(() => validateConfig(config)).toThrow(message);
    });
  });

  it('shares thresholds, exclude and legacyInventory between presets', () => {
    const shared = {
      thresholds: { crapLimit: 12 },
      exclude: ['src/main/java/generated/**'],
      legacyInventory: 'config/legacy.json',
    };
    expect(validateConfig({ preset: 'java', ...shared })).toEqual({ preset: 'java', ...shared });
    expect(validateConfig({ preset: 'typescript', ...shared })).toBeDefined();
    expect(() => validateConfig({ preset: 'java', thresholds: { crapLimit: 0 } })).toThrow(
      /positive number/,
    );
    expect(() => validateConfig({ preset: 'java', legacyInventory: '../x.json' })).toThrow(
      /inside the project/,
    );
  });

  it.each(
    ['java', 'kotlin'].flatMap((preset) => ['layout', 'exceptions'].map((key) => [preset, key])),
  )('rejects the %s preset with %s instead of ignoring it', (preset, key) => {
    expect(() => validateConfig({ preset, [key]: {} })).toThrow(
      `"${key}" is not supported with "preset": "${preset}"`,
    );
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

describe('strict exceptions', () => {
  const exception = {
    rule: 'nitpicker/preserve-error-cause',
    paths: ['src/legacy/**'],
    reason: 'Legacy module rewrites errors on purpose until the migration lands',
  };

  it('accepts an exception and a layout override', () => {
    expect(
      validateConfig({ exceptions: [exception], layout: { sourceRoots: ['lib'] } }),
    ).toBeDefined();
  });

  it.each([
    [{ exceptions: exception }, /"exceptions" must be an array/],
    [{ exceptions: [{ ...exception, reason: undefined }] }, /reason" is required/],
    [{ exceptions: [{ ...exception, reason: '  ' }] }, /reason" is required/],
    [{ exceptions: [{ ...exception, paths: [] }] }, /at least one path glob/],
    [{ exceptions: [{ ...exception, paths: 'src/**' }] }, /paths" must be an array/],
    [{ exceptions: [{ ...exception, rule: '' }] }, /rule" must be a non-empty rule id/],
    [{ exceptions: [{ ...exception, extra: 1 }] }, /unknown key "extra"/],
    [{ layout: { sourceRoot: ['lib'] } }, /unknown layout key "sourceRoot"/],
    [{ layout: { sourceRoots: 'lib' } }, /"layout.sourceRoots" must be an array/],
  ])('rejects %j', (config, message) => {
    expect(() => validateConfig(config)).toThrow(message);
  });

  it('reports each exception and layout override and changes the policy hash', () => {
    const plain = describeConfigOverrides({});
    const withException = describeConfigOverrides({ exceptions: [exception] });
    const withLayout = describeConfigOverrides({ layout: { sourceRoots: ['lib'] } });
    expect(withException).toEqual([`exception: ${JSON.stringify(exception)}`]);
    expect(withLayout).toEqual(['layout: {"sourceRoots":["lib"]}']);
    const hashes = [plain, withException, withLayout].map((overrides) => policyHash([], overrides));
    expect(new Set(hashes).size).toBe(3);
  });
});

describe('layout keys', () => {
  it('accepts entry point globs for files that are loaded by path', () => {
    const layout = { entryPoints: ['tools/*-runner.mjs'] };

    expect(validateConfig({ layout })).toEqual({ layout });
  });

  it('accepts the directory roots and the excluded globs together', () => {
    const layout = {
      sourceRoots: ['lib'],
      testRoots: ['spec'],
      excludedGlobs: ['**/vendor/**', '**/*.generated.ts'],
    };

    expect(validateConfig({ layout })).toEqual({ layout });
  });

  it('validates globs for excludedGlobs and directories for the roots', () => {
    expect(() => validateConfig({ layout: { excludedGlobs: ['**/vendor/**'] } })).not.toThrow();
    expect(() => validateConfig({ layout: { sourceRoots: ['**/vendor/**'] } })).toThrow(
      /entries must be directories inside the project/,
    );
    expect(() => validateConfig({ layout: { excludedGlobs: '**/vendor/**' } })).toThrow(
      /"layout.excludedGlobs" must be an array/,
    );
    expect(() => validateConfig({ layout: { excludedGlobs: [''] } })).toThrow(
      /"layout.excludedGlobs" must be an array of non-empty strings/,
    );
  });

  it('lists every allowed layout key when one is unknown', () => {
    expect(() => validateConfig({ layout: { roots: ['lib'] } })).toThrow(
      /Allowed layout keys: sourceRoots, testRoots, excludedGlobs/,
    );
  });
});
