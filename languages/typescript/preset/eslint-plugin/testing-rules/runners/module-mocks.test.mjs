import { rule as noInternalMocks } from '../../rules/testing/assertions/no-internal-module-mocks.mjs';
import { rule as noMockingSubjectUnderTest } from '../../rules/testing/assertions/no-mocking-subject-under-test.mjs';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';

const ruleTester = typescriptRuleTester();
const filename = '/repo/src/main/feature/__tests__/feature.test.ts';
const internal = "'../../logging/logger.js'";
const lines = (...parts) => parts.join('\n');

ruleTester.run('no-internal-module-mocks across runners', noInternalMocks, {
  valid: [
    "jest.mock('undici');",
    "import { jest } from '@jest/globals'; jest.mock('undici');",
    "import { mock } from 'node:test'; mock.module('undici', { namedExports: {} });",
    "import td from 'testdouble'; td.replace('undici');",
    "import quibble from 'quibble'; await quibble.esm('undici');",
    "import mockRequire from 'mock-require'; mockRequire('undici', {});",
    `mock.module(${internal});`,
    `import { mock } from './my-mocks.js'; mock.module(${internal});`,
    `import type { mock } from 'node:test'; mock.module(${internal});`,
    `import { mock } from 'node:test'; mock.fn(${internal});`,
    `import { jest } from '@jest/globals'; jest.fn(${internal});`,
    `import { jest } from '@jest/globals'; jest.mock(${internal}.length);`,
    `import mockRequire from './mock-require.js'; mockRequire(${internal}, {});`,
    `const local = require('./local.js'); local(${internal});`,
    `jest[mock](${internal});`,
  ].map((code) => ({ filename, code })),
  invalid: [
    `jest.mock(${internal});`,
    `jest.doMock(${internal});`,
    `jest.unstable_mockModule(${internal}, () => ({}));`,
    `jest.setMock(${internal}, {});`,
    `import { jest } from '@jest/globals'; jest.mock(${internal});`,
    `import { jest as runner } from '@jest/globals'; runner.mock(${internal});`,
    `import { mock } from 'node:test'; mock.module(${internal}, { namedExports: {} });`,
    `import { mock as doubles } from 'node:test'; doubles.module(${internal});`,
    `import test from 'node:test'; test.mock.module(${internal});`,
    `import { it } from 'node:test'; it('x', (t) => { t.mock.module(${internal}); });`,
    `const { mock } = require('node:test'); mock.module(${internal});`,
    `import mockRequire from 'mock-require'; mockRequire(${internal}, {});`,
    `const mockRequire = require('mock-require'); mockRequire(${internal}, {});`,
    `import td from 'testdouble'; td.replace(${internal});`,
    `const td = require('testdouble'); td.replace(${internal});`,
    `import quibble from 'quibble'; await quibble.esm(${internal});`,
    `import quibble from 'quibble'; await quibble(${internal});`,
    `jest.mock(import(${internal}));`,
  ].map((code) => ({ filename, code, errors: [{ messageId: 'internalMock' }] })),
});

ruleTester.run('no-mocking-subject-under-test across runners', noMockingSubjectUnderTest, {
  valid: [
    lines("import { execute } from '../feature.js';", "jest.mock('undici');", 'execute();'),
    lines(
      "import { execute } from '../feature.js';",
      "import { mock } from 'node:test';",
      "mock.module('../infrastructure/http-seam.js');",
      'execute();',
    ),
    lines("import { mock } from 'node:test';", "mock.module('../feature.js');"),
  ].map((code) => ({ filename, code })),
  invalid: [
    lines("import { execute } from '../feature.js';", "jest.mock('../feature.js');", 'execute();'),
    lines(
      "import { execute } from '../feature.js';",
      "import { jest } from '@jest/globals';",
      "jest.doMock('../feature.js');",
      'execute();',
    ),
    lines(
      "import { execute } from '../feature.js';",
      "import { mock } from 'node:test';",
      "mock.module('../feature.js', { namedExports: {} });",
      'execute();',
    ),
    lines(
      "import { execute } from '../feature.js';",
      "import quibble from 'quibble';",
      "await quibble.esm('../feature.js');",
      'execute();',
    ),
    lines(
      "import { execute } from '../feature.js';",
      "import td from 'testdouble';",
      "td.replace('../feature.js');",
      'execute();',
    ),
  ].map((code) => ({
    filename,
    code,
    errors: [{ messageId: 'mockedSubject', data: { source: '../feature.js' } }],
  })),
});
