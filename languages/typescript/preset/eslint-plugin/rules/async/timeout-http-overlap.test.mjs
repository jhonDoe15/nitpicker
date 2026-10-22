import { describe, expect, it } from 'vitest';
import { productionPolicyConfigFor } from '../../../eslint-config/policy/production-policy.mjs';
import { lintFixture } from '../../../failure-messages/test-support/harness.mjs';
import { defaultResolvedLayout } from '../../../layout.mjs';
import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule } from './timeout-abandons-operation.mjs';

const REJECT_AFTER =
  'const rejectAfter = (ms: number) => new Promise<never>((_, reject) => setTimeout(reject, ms));\n';
const RULES = new Set(['nitpicker/timeout-abandons-operation', 'nitpicker/require-http-timeout']);

function ruleIdsFor(code, options) {
  const config = productionPolicyConfigFor(defaultResolvedLayout, options);
  return lintFixture({ config, filename: 'src/fixture.ts', code })
    .map((message) => message.ruleId)
    .filter((ruleId) => RULES.has(ruleId));
}

describe('timeout race next to the HTTP timeout rule', () => {
  it.each([
    ['fetch', 'fetch(url)'],
    ['axios', 'axios.get(url)'],
    ['got', 'got(url)'],
  ])('leaves an unbounded %s call to require-http-timeout', (_name, call) => {
    const code = `import axios from "axios";\nimport got from "got";\n${REJECT_AFTER}export const run = (url: string) => Promise.race([${call}, rejectAfter(10)]);`;

    expect(ruleIdsFor(code, {})).toEqual(['nitpicker/require-http-timeout']);
  });

  it('reports a browser fetch that the HTTP rule leaves alone', () => {
    const code = `${REJECT_AFTER}export const run = (url: string) => Promise.race([fetch(url), rejectAfter(10)]);`;

    expect(ruleIdsFor(code, { react: true })).toEqual(['nitpicker/timeout-abandons-operation']);
  });

  it('reports a project function once and not as an HTTP call', () => {
    const code = `${REJECT_AFTER}export const run = () => Promise.race([sendPayment(), rejectAfter(10)]);`;

    expect(ruleIdsFor(code, {})).toEqual(['nitpicker/timeout-abandons-operation']);
  });

  it('does not report a test file', () => {
    const code = `${REJECT_AFTER}export const run = () => Promise.race([sendPayment(), rejectAfter(10)]);`;
    const config = productionPolicyConfigFor(defaultResolvedLayout, {});
    const found = lintFixture({ config, filename: 'src/run.test.ts', code });

    expect(found.filter((message) => RULES.has(message.ruleId))).toEqual([]);
  });
});

const tester = createRuleTester();
tester.run('timeout-abandons-operation with HTTP clients', rule, {
  valid: [
    'import axios from "axios"; export const run = (url, timeout) => Promise.race([axios.get(url), timeout]);',
    'import got from "got"; const rejectAfter = (ms) => new Promise((_, reject) => setTimeout(reject, ms)); export const run = (url) => Promise.race([got(url, { signal: AbortSignal.timeout(5) }), rejectAfter(5)]);',
  ],
  invalid: [
    {
      code: 'import got from "got"; import { rejectAfter } from "./timers.js"; export const run = (url) => Promise.race([got.paginate(url), rejectAfter(5)]);',
      errors: [
        {
          messageId: 'noSignal',
          data: { timeout: '`rejectAfter(...)`', operation: 'got.paginate', parameter: '' },
        },
      ],
    },
    {
      code: 'import { rejectAfter } from "./timers.js"; export const run = (url) => Promise.race([fetch(url), rejectAfter(5)]);',
      options: [{ fetch: false }],
      errors: [
        {
          messageId: 'noSignal',
          data: { timeout: '`rejectAfter(...)`', operation: 'fetch', parameter: '' },
        },
      ],
    },
  ],
});
