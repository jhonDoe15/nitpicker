import { RuleTester } from 'eslint';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rule as testMustUseProductionRuntime } from '../eslint-plugin/rules/testing/assertions/test-must-use-production-runtime.mjs';
import { resolveLayout } from '../layout.mjs';
import { analyzeTestRuntime } from '../test-runtime/analyze.mjs';

RuleTester.afterAll = afterAll;
RuleTester.afterEach = afterEach;
RuleTester.beforeAll = beforeAll;
RuleTester.beforeEach = beforeEach;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const projectFile = (file) => path.join(process.cwd(), file);
const playwrightSpec = "import { test } from '@playwright/test'; test('login', async () => {});";

new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
}).run('test-must-use-production-runtime for the e2e root', testMustUseProductionRuntime, {
  valid: [
    { filename: projectFile('e2e/login.spec.ts'), code: playwrightSpec },
    { filename: projectFile('e2e/flows/checkout.test.ts'), code: playwrightSpec },
    {
      filename: projectFile('src/crypto/e2e/encrypt.test.ts'),
      code: "import { encrypt } from './encrypt.js'; encrypt();",
    },
  ],
  invalid: [
    { filename: projectFile('test/e2e/login.spec.ts'), code: playwrightSpec, errors: 1 },
    { filename: projectFile('tests/login.spec.ts'), code: playwrightSpec, errors: 1 },
  ],
});

describe('the e2e root in the layout', () => {
  it('is recognised only at the repo root', () => {
    const layout = resolveLayout();

    expect(
      [
        'e2e/login.spec.ts',
        'e2e/support/page.ts',
        'src/crypto/e2e/encrypt.ts',
        'test/e2e/a.ts',
      ].map((file) => layout.isEndToEndTest(file)),
    ).toEqual([true, true, false, false]);
  });

  it('is not recognised when the configured test roots leave it out', () => {
    expect(resolveLayout({ testRoots: ['test'] }).isEndToEndTest('e2e/login.spec.ts')).toBe(false);
  });

  it('selects its code files for the lint exception, only while it is a test root', () => {
    expect(resolveLayout().endToEndGlobs).toEqual(['e2e/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect(resolveLayout({ testRoots: ['test'] }).endToEndGlobs).toEqual([]);
  });

  it('is left out of the executed test roots by default and kept when listed', () => {
    expect(resolveLayout().executedTestRoots).toEqual(['test', 'tests', '__tests__']);
    expect(resolveLayout({ testRoots: ['test', 'e2e'] }).executedTestRoots).toEqual([
      'test',
      'e2e',
    ]);
  });
});

describe('the test-runtime analysis of the e2e root', () => {
  it('excludes a root e2e spec and still reports a unit test that runs no production code', () => {
    const report = analyzeTestRuntime({
      modules: [
        { source: 'e2e/login.spec.ts', dependencies: [] },
        { source: 'e2e/support/page.ts', dependencies: [] },
        { source: 'test/none.test.ts', dependencies: [] },
        { source: 'src/crypto/e2e/encrypt.test.ts', dependencies: [] },
      ],
    });

    expect(report.exclusions).toEqual(['e2e/login.spec.ts']);
    expect(report.findings.map((finding) => finding.test)).toEqual([
      'src/crypto/e2e/encrypt.test.ts',
      'test/none.test.ts',
    ]);
  });
});
