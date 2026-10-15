import { describe, expect, it } from 'vitest';
import { validateConfig } from '../config.mjs';

describe('hygiene exceptions', () => {
  const exception = (rule) => ({ rule, paths: ['config/**'], reason: 'Fixture' });

  it.each(['committed-env-file', 'committed-private-key', 'committed-binary', 'large-file'])(
    'accepts an exception for %s in every preset',
    (rule) => {
      for (const preset of ['typescript', 'javascript', 'java', 'kotlin', 'python']) {
        const config = { preset, exceptions: [exception(rule)] };
        expect(validateConfig(config)).toEqual(config);
      }
    },
  );

  it('keeps the package rules to the TypeScript and JavaScript presets', () => {
    for (const rule of ['unused-dependency', 'unlisted-dependency', 'unresolved-import']) {
      const config = { preset: 'typescript', exceptions: [exception(rule)] };
      expect(validateConfig(config)).toEqual(config);
      expect(() => validateConfig({ preset: 'python', exceptions: [exception(rule)] })).toThrow(
        '"exceptions" is not supported with "preset": "python"',
      );
      expect(() => validateConfig({ preset: 'java', exceptions: [exception(rule)] })).toThrow(
        /"exceptions\[0\]\.rule" must name a finding as it is printed/u,
      );
    }
  });
});

describe('package exceptions', () => {
  const entry = (fields) => ({
    paths: ['package.json'],
    reason: 'Loaded by a plugin',
    ...fields,
  });

  it('accepts a packages list for the package rules', () => {
    const config = {
      preset: 'typescript',
      exceptions: [entry({ rule: 'unused-dependency', packages: ['left-pad'] })],
    };

    expect(validateConfig(config)).toEqual(config);
  });

  it('rejects a packages list on other rules, or an empty one', () => {
    expect(() =>
      validateConfig({ exceptions: [entry({ rule: 'large-file', packages: ['a'] })] }),
    ).toThrow(
      'nitpicker.config.json: "exceptions[0].packages" is only for the rules unused-dependency, unlisted-dependency, unresolved-import',
    );
    expect(() =>
      validateConfig({ exceptions: [entry({ rule: 'unused-dependency', packages: [] })] }),
    ).toThrow('nitpicker.config.json: "exceptions[0].packages" needs at least one package name');
    expect(() =>
      validateConfig({ exceptions: [entry({ rule: 'unused-dependency', packages: [''] })] }),
    ).toThrow(
      'nitpicker.config.json: "exceptions[0].packages" must be an array of non-empty strings',
    );
  });
});
