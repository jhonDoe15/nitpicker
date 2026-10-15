import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate.mjs';

describe('tools.tests', () => {
  it.each(['vitest', 'jest', 'node-test', undefined])('accepts %s as the test runner', (runner) => {
    expect(validateConfig({ tools: { tests: { runner } } })).toEqual({
      tools: { tests: { runner } },
    });
  });

  it.each(['mocha', 'node:test', '', 7])('rejects %j as the test runner', (runner) => {
    expect(() => validateConfig({ tools: { tests: { runner } } })).toThrow(
      new Error(
        'nitpicker.config.json: "tools.tests.runner" must be one of: vitest, jest, node-test. It names the test runner nitpicker runs your tests with; without it the runner is detected from package.json and the test files',
      ),
    );
  });

  it('rejects an unknown key under the test runner tool', () => {
    expect(() => validateConfig({ tools: { tests: { precedence: ['project'] } } })).toThrow(
      new Error(
        'nitpicker.config.json: "tools.tests" has unknown key "precedence". Allowed keys: runner',
      ),
    );
  });

  it('rejects the test runner tool for a Java project', () => {
    expect(() => validateConfig({ preset: 'java', tools: { tests: { runner: 'jest' } } })).toThrow(
      new Error(
        'nitpicker.config.json: "tools" names unknown tool "tests". Supported tools with this preset: pmd, checkstyle',
      ),
    );
  });
});
