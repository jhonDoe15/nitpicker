import { describe, expect, it } from 'vitest';
import { exceptionMatcher } from '../../shared/rules/exceptions.mjs';
import { validateConfig } from './validate.mjs';

describe('hygiene exceptions', () => {
  const exception = (rule) => ({ rule, paths: ['config/**'], reason: 'Fixture' });

  it.each([
    'committed-env-file',
    'committed-private-key',
    'committed-binary',
    'large-file',
    'committed-build-output',
  ])('accepts an exception for %s in every preset', (rule) => {
    for (const preset of ['typescript', 'javascript', 'java', 'kotlin', 'python']) {
      const config = { preset, exceptions: [exception(rule)] };
      expect(validateConfig(config)).toEqual(config);
    }
  });

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

function liftOf(rule, paths = ['src/legacy/**']) {
  return { exceptions: [{ rule, paths, reason: 'legacy code' }] };
}

describe('config exceptions', () => {
  it.each([['typescript'], ['javascript']])(
    'sends doc-comment-content to nitpicker/no-comments with the %s preset',
    (preset) => {
      expect(() => validateConfig({ preset, ...liftOf('doc-comment-content') })).toThrow(
        `nitpicker.config.json: "exceptions[0].rule" names doc-comment-content, which the ${preset} preset reports as nitpicker/no-comments: name "nitpicker/no-comments" instead`,
      );
      expect(() => validateConfig({ preset, ...liftOf('nitpicker/no-comments') })).not.toThrow();
    },
  );

  it('rejects a path glob of a nitpicker rule that can never match', () => {
    expect(() => validateConfig(liftOf('test-only-export', ['./src/legacy/**']))).toThrow(
      'nitpicker.config.json: "exceptions[0].paths" glob "./src/legacy/**" can never match: drop the leading "./": globs match from the project root',
    );
    expect(() => validateConfig(liftOf('file-lines-limit', ['src/legacy/']))).toThrow(
      'nitpicker.config.json: "exceptions[0].paths" glob "src/legacy/" can never match: drop the trailing "/": write "src/legacy/**"',
    );
  });

  it('takes a bracketed route folder, whose brackets match themselves', () => {
    const config = liftOf('test-only-export', ['src/app/[id]/**']);
    const isExcepted = exceptionMatcher(validateConfig(config).exceptions);

    expect(isExcepted('test-only-export', 'src/app/[id]/page.tsx')).toBe(true);
    expect(isExcepted('test-only-export', 'src/app/i/page.tsx')).toBe(false);
  });

  it('leaves the path globs of an ESLint rule to ESLint, which reads character classes', () => {
    const config = { preset: 'typescript', ...liftOf('no-console', ['src/[ab]/**']) };

    expect(validateConfig(config)).toEqual(config);
  });
});
