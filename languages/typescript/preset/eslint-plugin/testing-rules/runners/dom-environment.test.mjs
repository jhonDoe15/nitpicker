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

const mochaDom = {
  environment: 'jsdom',
  runner: 'mocha',
  setupFiles: ['global-jsdom/register'],
  globalDom: 'global-jsdom/register',
};
const nodeDom = {
  ...mochaDom,
  runner: 'node',
  globalDom: '@happy-dom/global-registrator/register',
};

ruleTester.run('no-unused-dom-environment under a DOM that Mocha or node:test registers', rule, {
  valid: [
    { filename, code: lines('document.body.append("x");', logic), options: [mochaDom] },
    { filename, code: lines("import 'global-jsdom/register';", 'document.title;') },
    {
      filename,
      code: lines("require('global-jsdom/register');", 'window.scrollTo(0, 0);'),
      options: [{ environment: 'node', runner: 'node' }],
    },
    {
      filename,
      code: lines(docblock('jsdom', 'jest'), logic),
      options: [{ environment: 'node', runner: 'mocha' }],
    },
    {
      filename,
      code: lines(docblock('jsdom'), logic),
      options: [{ environment: 'node', runner: 'node' }],
    },
  ],
  invalid: [
    {
      filename,
      code: logic,
      options: [mochaDom],
      errors: report('unusedGlobalDom', {
        environment: 'jsdom',
        setup: 'global-jsdom/register',
        setupPlace: 'the Mocha `require` setup (.mocharc or the test script)',
        separateRun: 'a separate Mocha run',
      }),
    },
    {
      filename,
      code: logic,
      options: [nodeDom],
      errors: report('unusedGlobalDom', {
        environment: 'jsdom',
        setup: '@happy-dom/global-registrator/register',
        setupPlace: 'the `--import` or `--require` flags of the `node --test` script',
        separateRun: 'a separate `node --test` run',
      }),
    },
    {
      filename,
      code: lines("import 'global-jsdom/register';", logic),
      options: [{ environment: 'node', runner: 'mocha' }],
      errors: report('unusedRegisteredEnvironment', {
        environment: 'jsdom',
        directive: 'global-jsdom/register',
      }),
    },
    {
      filename,
      code: lines("const { GlobalRegistrator } = require('@happy-dom/global-registrator');", logic),
      options: [{ environment: 'node', runner: 'node' }],
      errors: report('unusedRegisteredEnvironment', {
        environment: 'happy-dom',
        directive: '@happy-dom/global-registrator',
      }),
    },
  ],
});
