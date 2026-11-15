import { afterEach, describe, expect, it } from 'vitest';
import { eslintMessageWithHint } from '../../../typescript/adapters/hints/eslint-hints.mts';
import { HEAD_POLICY_ENV } from '../../../../shared/head-policy.mjs';
import { typescriptApi } from '../../../typescript/adapters/typed/typescript-program.mts';
import {
  resolveHeadPolicy,
  withHeadPolicyFile,
} from '../../../typescript/adapters/dependency-graph/typed/head-policy-views.mts';

const originalPolicy = process.env[HEAD_POLICY_ENV];
const hintSource = typescriptApi().createSourceFile(
  'hint.js',
  '',
  typescriptApi().ScriptTarget.Latest,
);

function hintOf(input: { ruleId: string; text: string; relativePath: string }): string {
  return eslintMessageWithHint({ ...input, node: undefined, sourceFile: hintSource });
}

afterEach(() => {
  if (originalPolicy === undefined) {
    Reflect.deleteProperty(process.env, HEAD_POLICY_ENV);
  } else {
    process.env[HEAD_POLICY_ENV] = originalPolicy;
  }
});

function unsafeAnyMessage() {
  return hintOf({
    ruleId: '@typescript-eslint/no-unsafe-return',
    text: 'Unsafe return of a value of type `any`.',
    relativePath: 'src/main/a.js',
  });
}

function withPreset(config: object, check: () => void): void {
  withHeadPolicyFile(resolveHeadPolicy(config), (policyFile) => {
    process.env[HEAD_POLICY_ENV] = policyFile;
    check();
  });
}

function nodeTestMessage() {
  return hintOf({
    ruleId: 'vitest/no-import-node-test',
    text: 'Import from vitest instead of node:test',
    relativePath: 'test/greet.test.mjs',
  });
}

describe('node:test hint', () => {
  it('says Vitest does not collect node:test files and names the setting that switches runner', () => {
    expect(nodeTestMessage()).toBe(
      'Import from vitest instead of node:test nitpicker runs this project\'s tests with Vitest, which does not collect node:test files. Import from `vitest`, or, if the project runs its tests with node:test, set "tools.tests.runner" to "node" in nitpicker.config.json. An exception fits only a file that must stay on node:test while the rest of the project runs on Vitest.',
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
        hintOf({
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
