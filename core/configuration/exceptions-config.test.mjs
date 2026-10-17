import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate.mjs';

function liftOf(rule, paths = ['src/legacy/**']) {
  return { exceptions: [{ rule, paths, reason: 'legacy code' }] };
}

describe('exceptions config', () => {
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

  it('leaves the path globs of an ESLint rule to ESLint, which reads character classes', () => {
    const config = { preset: 'typescript', ...liftOf('no-console', ['src/[ab]/**']) };

    expect(validateConfig(config)).toEqual(config);
  });
});
