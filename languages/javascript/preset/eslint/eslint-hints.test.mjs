import { afterEach, describe, expect, it } from 'vitest';
import { eslintMessageWithHint } from '../../../typescript/adapters/hints/eslint-hints.mjs';
import { resolveHeadPolicy, withHeadPolicyFile } from '../../../typescript/preset/head-policy.mjs';

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

function nodeTestMessage() {
  return eslintMessageWithHint({
    ruleId: 'vitest/no-import-node-test',
    text: 'Import from vitest instead of node:test',
    relativePath: 'test/greet.test.mjs',
  });
}

describe('node:test hint', () => {
  it('says Vitest is the only runner, names issue #162 and when an exception fits', () => {
    expect(nodeTestMessage()).toBe(
      'Import from vitest instead of node:test nitpicker runs tests with Vitest only (Jest and node:test support is tracked in issue #162). An exception fits only a file that must stay on node:test.',
    );
  });
});

describe('unsafe any hint', () => {
  it('points a JavaScript project at JSDoc types', () => {
    withPreset({ preset: 'javascript' }, () => {
      expect(unsafeAnyMessage()).toBe(
        'Unsafe return of a value of type `any`. Give the value a JSDoc type at its source (`@param {string} name`, `@returns {Type}`, `@type {Type}`), or read fields of a legacy `any` value through one reader function whose parameter is `{unknown}` and that returns a typed object.',
      );
    });
  });

  it('tells domain code to have adapters parse a legacy any', () => {
    withPreset({ preset: 'javascript' }, () => {
      expect(
        eslintMessageWithHint({
          ruleId: '@typescript-eslint/no-unsafe-return',
          text: 'Unsafe return.',
          relativePath: 'src/main/features/billing/domain/split.js',
        }),
      ).toBe(
        'Unsafe return. Give the value a JSDoc type at its source (`@param {string} name`, `@returns {Type}`, `@type {Type}`): domain/ cannot take `{unknown}`, so have adapters/ parse a legacy `any` value into a typed object and pass that in.',
      );
    });
  });

  it('keeps the TypeScript wording for a TypeScript project', () => {
    withPreset({}, () => {
      expect(unsafeAnyMessage()).toBe(
        'Unsafe return of a value of type `any`. If the value is a legacy `any`, read it through one reader function whose parameter is `unknown` and that returns a typed object, kept in adapters/; fix any TypeScript error on the line first.',
      );
    });
  });
});
