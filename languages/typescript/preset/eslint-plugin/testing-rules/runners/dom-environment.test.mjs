import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule } from '../../rules/testing/environment/no-unused-dom-environment.mjs';
import { createProject, docblock, lines, logic } from '../test-support/environment-project.mjs';

RuleTester.afterAll = afterAll;
RuleTester.afterEach = afterEach;
RuleTester.beforeAll = beforeAll;
RuleTester.beforeEach = beforeEach;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const root = createProject();
const filename = path.join(root, 'src/widgets/widget.test.ts');
const jestDom = { environment: 'jsdom', runner: 'jest' };

const report = (messageId, data) => [{ messageId, data, line: 1 }];

ruleTester.run('no-unused-dom-environment under Jest', rule, {
  valid: [
    "jest.mock('@testing-library/dom');",
    "jest.requireActual('@testing-library/dom');",
    "jest.requireMock('@testing-library/dom');",
    "jest.unstable_mockModule('@testing-library/dom', () => ({}));",
    "jest.setMock('@testing-library/dom', {});",
  ].map((statement) => ({ filename, code: lines(statement, logic), options: [jestDom] })),
  invalid: [
    {
      filename,
      code: logic,
      options: [jestDom],
      errors: report('unusedProjectEnvironment', {
        environment: 'jsdom',
        directive: '@jest-environment',
      }),
    },
    {
      filename,
      code: lines(docblock('jsdom', 'jest'), logic),
      options: [jestDom],
      errors: report('unusedDirectiveOverDomProject', {
        environment: 'jsdom',
        directive: '@jest-environment',
      }),
    },
    {
      filename,
      code: logic,
      options: [{ environment: 'jsdom' }],
      errors: report('unusedProjectEnvironment', {
        environment: 'jsdom',
        directive: '@vitest-environment',
      }),
    },
  ],
});

ruleTester.run('no-unused-dom-environment with node:test mocks', rule, {
  valid: [
    "import { mock } from 'node:test'; mock.module('@testing-library/dom');",
    "import test from 'node:test'; test.mock.module('@testing-library/dom');",
    "import { it } from 'node:test'; it('x', (t) => { t.mock.module('@testing-library/dom'); });",
  ].map((statement) => ({
    filename,
    code: lines(statement, logic),
    options: [{ environment: 'jsdom' }],
  })),
  invalid: [
    {
      filename,
      code: lines("mock.fn('@testing-library/dom');", logic),
      options: [{ environment: 'jsdom' }],
      errors: report('unusedProjectEnvironment', {
        environment: 'jsdom',
        directive: '@vitest-environment',
      }),
    },
  ],
});
