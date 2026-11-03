import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from '../no-assertion-in-loop.mjs';

const filename = '/repo/test/report.test.ts';

export const NODE_TEST =
  "import test from 'node:test';\nimport assert from 'node:assert/strict';\n";
export const CHAI = "import { assert, expect } from 'chai';\n";

export function runCases(name, { valid, invalid }, options = []) {
  typescriptRuleTester().run(name, rule, {
    valid: valid.map((code) => ({ filename, code, options })),
    invalid: invalid.map(([code, messageId, construct]) => ({
      filename,
      code,
      options,
      errors: [{ messageId, data: { construct } }],
    })),
  });
}
