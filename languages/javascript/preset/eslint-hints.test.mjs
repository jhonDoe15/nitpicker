import { afterEach, describe, expect, it } from 'vitest';
import { eslintMessageWithHint } from '../../typescript/adapters/eslint-hints.mjs';
import { resolveHeadPolicy, withHeadPolicyFile } from '../../typescript/preset/head-policy.mjs';

const originalPolicy = process.env.NITPICKER_POLICY;

afterEach(() => {
  if (originalPolicy === undefined) {
    delete process.env.NITPICKER_POLICY;
  } else {
    process.env.NITPICKER_POLICY = originalPolicy;
  }
});

function unsafeAnyMessage() {
  return eslintMessageWithHint({
    ruleId: '@typescript-eslint/no-unsafe-return',
    text: 'Unsafe return of a value of type `any`.',
    relativePath: 'src/main/a.js',
  });
}

function withPreset(config, check) {
  withHeadPolicyFile(resolveHeadPolicy(config), (policyFile) => {
    process.env.NITPICKER_POLICY = policyFile;
    check();
  });
}

describe('unsafe any hint', () => {
  it('points a JavaScript project at JSDoc types', () => {
    withPreset({ preset: 'javascript' }, () => {
      const message = unsafeAnyMessage();
      expect(message).toContain('Give the value a JSDoc type at its source');
      expect(message).toContain('`@param {string} name`');
      expect(message).toContain('parameter is `{unknown}`');
    });
  });

  it('keeps the TypeScript wording for a TypeScript project', () => {
    withPreset({}, () => {
      const message = unsafeAnyMessage();
      expect(message).toContain('parameter is `unknown`');
      expect(message).not.toContain('JSDoc');
    });
  });
});
