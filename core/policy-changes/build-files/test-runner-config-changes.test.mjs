import { describe, expect, it } from 'vitest';
import { between } from './test-support/policy-fixtures.mjs';

const PROJECT = { precedence: ['project', 'nitpicker'] };

describe('the test runner config the project opted into', () => {
  const at = (files) => ({ 'src/a.ts': 'export const a = 1;\n', ...files });
  const manifest = (mocha) => JSON.stringify({ name: 'p', version: '1.0.0', mocha });

  it.each([undefined, 'javascript'])(
    'counts an edit of the Vitest or Mocha config the %s project opted into',
    (preset) => {
      const config = { preset, tools: { tests: PROJECT } };
      const vitest = (retry) => ({
        'vitest.config.mjs': `export default { test: { retry: ${retry} } };\n`,
      });

      expect(
        between({ base: at(vitest(0)), head: at(vitest(2)), config }).policyLoosenings,
      ).toEqual(['tests project config changed: vitest.config.mjs']);
      expect(
        between({
          base: at({ '.mocharc.yml': 'retries: 0\n' }),
          head: at({ '.mocharc.yml': '# flaky\nretries: 0\n' }),
          config,
        }).policyLoosenings,
      ).toEqual([]);
      expect(
        between({
          base: at({ 'package.json': manifest({ retries: 0 }) }),
          head: at({ 'package.json': manifest({ retries: 3 }) }),
          config,
        }).policyLoosenings,
      ).toEqual(['tests project config changed: package.json']);
      expect(
        between({
          base: at({ 'package.json': manifest({ retries: 0 }) }),
          head: at({ 'package.json': manifest({ retries: 0 }).replace('1.0.0', '1.1.0') }),
          config,
        }).policyLoosenings,
      ).toEqual([]);
      expect(
        between({ base: at(vitest(0)), head: at(vitest(2)), config: { preset } }).policyLoosenings,
      ).toEqual([]);
    },
  );
});
