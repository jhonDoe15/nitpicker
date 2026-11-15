import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../no-assertion-in-loop.mjs';

const filename = '/repo/test/report.test.ts';

export const NODE_TEST =
  "import test from 'node:test';\nimport assert from 'node:assert/strict';\n";
export const CHAI = "import { assert, expect } from 'chai';\n";

type Cases = { valid: string[]; invalid: [string, string, string][] };

export function runCases(name: string, { valid, invalid }: Cases, options: unknown[] = []): void {
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
