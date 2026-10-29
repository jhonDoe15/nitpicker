import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from '../no-unowned-async-assertion.mjs';

const filename = '/repo/test/report.test.ts';

export const FS = "import fs from 'node:fs';\n";
export const VITEST = "import { expect, it } from 'vitest';\n";
export const NODE_TEST = "import test from 'node:test';\n";

export function runCases(name, { valid, invalid }) {
  typescriptRuleTester().run(name, rule, {
    valid: valid.map((code) => ({ filename, code })),
    invalid: invalid.map(([code, messageId, host]) => ({
      filename,
      code,
      errors: [{ messageId, data: { host } }],
    })),
  });
}
