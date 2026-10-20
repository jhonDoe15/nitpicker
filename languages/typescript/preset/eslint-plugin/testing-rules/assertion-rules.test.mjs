import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noWaitFor } from '../rules/testing/assertions/no-wait-for-with-fake-timers.mjs';
import { rule as noInternalMocks } from '../rules/testing/assertions/no-internal-module-mocks.mjs';
import { rule as noPartialOutputAssertion } from '../rules/testing/assertions/no-partial-output-assertion.mjs';
import { rule as noMockingSubjectUnderTest } from '../rules/testing/assertions/no-mocking-subject-under-test.mjs';
import { rule as testTsconfigPinsLibAndTypes } from '../rules/testing/types/test-tsconfig-pins-lib-and-types.mjs';
import { rule as testMustUseProductionRuntime } from '../rules/testing/assertions/test-must-use-production-runtime.mjs';
import { rule as integrationTestUsesApprovedHarness } from '../rules/testing/processes/integration-test-uses-approved-harness.mjs';

RuleTester.afterAll = afterAll;

RuleTester.afterEach = afterEach;

RuleTester.beforeAll = beforeAll;

RuleTester.beforeEach = beforeEach;

RuleTester.describe = describe;

RuleTester.it = it;

RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

const testFile = '/repo/tests/integration/repository.test.ts';
const lines = (...parts) => parts.join('\n');
const filename = '/repo/src/main/feature/__tests__/feature.test.ts';
ruleTester.run('test-must-use-production-runtime', testMustUseProductionRuntime, {
  valid: [
    {
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "import { execute } from '../feature.js'; execute();",
    },
    {
      filename: '/repo/tests/contract/schema.test.ts',
      code: "import { describe } from 'vitest'; describe('schema', () => {});",
    },
    {
      // src/main/**/utils is ordinary production code, not a test-support
      // directory.
      filename: '/repo/src/main/utils/__tests__/format.test.ts',
      code: "import { execute } from '../format.js'; execute();",
    },
    {
      // A source root's index, imported as a directory.
      filename: '/repo/tests/url.test.ts',
      code: "import { parseURL } from '../src'; parseURL('/');",
    },
    {
      // An extensionless import of a source file.
      filename: '/repo/tests/url.test.ts',
      code: "import { parseURL } from '../src/parse'; parseURL('/');",
    },
    {
      // A dynamic import counts too — the common vi.mock()-then-reimport shape.
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "const { execute } = await import('../feature.js'); execute();",
    },
    {
      filename: '/repo/tests/greet.test.cjs',
      code: "const { greet } = require('../src/main/greet.cjs'); greet();",
    },
    {
      filename: '/repo/preset/test-runtime/fixtures/positive/tests/unit/fixture.test.ts',
      code: "import { describe } from 'vitest'; describe('fixture', () => {});",
      options: [{ exemptPattern: String.raw`/tests/contract/|/preset/.*/fixtures/` }],
    },
    {
      filename: '/repo/test/support/stdout.ts',
      code: "import { vi } from 'vitest'; export function captureStdout() { return vi.spyOn(process.stdout, 'write'); }",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "import type { Feature } from '../feature.js'; const value: Feature | undefined = undefined;",
      errors: [{ messageId: 'missingRuntime' }],
    },
    {
      filename: '/repo/tests/greet.test.cjs',
      code: "const path = require('node:path'); path.join('a');",
      errors: [{ messageId: 'missingRuntime' }],
    },
    {
      filename: '/repo/test/support/stdout.spec.ts',
      code: "import { captureStdout } from './stdout.js'; captureStdout();",
      errors: [{ messageId: 'missingRuntime' }],
    },
    {
      filename: '/repo/preset/test-runtime/fixtures/positive/tests/unit/fixture.test.ts',
      code: "import { describe } from 'vitest'; describe('fixture', () => {});",
      errors: [{ messageId: 'missingRuntime' }],
    },
  ],
});
ruleTester.run('no-mocking-subject-under-test', noMockingSubjectUnderTest, {
  valid: [
    {
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "import { execute } from '../feature.js'; import { vi } from 'vitest'; vi.mock('undici'); execute();",
    },
    {
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "import { execute } from '../feature.js'; import { vi } from 'vitest'; vi.mock('../infrastructure/http-seam.js'); execute();",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: "import { execute } from '../feature.js'; import { vi } from 'vitest'; vi.mock('../feature.js'); execute();",
      errors: [{ messageId: 'mockedSubject', data: { source: '../feature.js' } }],
    },
    ...[
      "vi.mock(import('../feature.js'), () => ({ execute: vi.fn() }));",
      "jest.mock('../feature.js');",
      "vi['doMock']('../feature.js');",
    ].map((mock) => ({
      filename: '/repo/src/main/feature/__tests__/feature.test.ts',
      code: `import { execute } from '../feature.js'; ${mock} execute();`,
      errors: [{ messageId: 'mockedSubject', data: { source: '../feature.js' } }],
    })),
  ],
});
ruleTester.run('integration-test-uses-approved-harness', integrationTestUsesApprovedHarness, {
  valid: [
    {
      filename: '/repo/tests/integration/application.test.ts',
      code: "import { startApp as boot } from '../fixtures/app.js'; boot();",
    },
    {
      filename: '/repo/tests/integration/custom.test.ts',
      code: "import { createServer } from '../../src/main/server.js'; createServer();",
      options: [{ approvedFunctions: ['createServer'] }],
    },
    {
      filename: '/repo/tests/integration/app.test.ts',
      code: "import { AppProcess } from '../fixtures/app-process.js'; AppProcess.start();",
    },
  ],
  invalid: [
    {
      filename: '/repo/tests/integration/application.test.ts',
      code: "import { describe } from 'vitest'; describe('application', () => {});",
      errors: [{ messageId: 'missingHarness' }],
    },
    {
      filename: '/repo/tests/integration/custom.test.ts',
      code: "import { startApp } from '../fixtures/app.js'; startApp();",
      options: [{ approvedFunctions: ['createServer'] }],
      errors: [{ messageId: 'missingHarness' }],
    },
  ],
});
ruleTester.run('test-tsconfig-pins-lib-and-types', testTsconfigPinsLibAndTypes, {
  valid: [
    {
      filename: testFile,
      code: "writeFileSync(file, JSON.stringify({ compilerOptions: { strict: true, lib: ['ES2022'], types: [] } }));",
    },
    {
      filename: testFile,
      code: 'const tsconfig = { compilerOptions: { noLib: true, types: [] } }; writeFileSync(file, JSON.stringify(tsconfig));',
    },
    {
      filename: testFile,
      code: lines(
        "const pinned = { lib: ['ES2022'], types: [] };",
        'writeFileSync(file, JSON.stringify({ compilerOptions: { ...pinned, strict: true } }));',
      ),
    },
    {
      filename: testFile,
      code: "import { base } from './base.js'; JSON.stringify({ compilerOptions: { ...base } });",
    },
    {
      filename: testFile,
      code: "writeFileSync(file, JSON.stringify({ name: 'fixture', private: true }));",
    },
  ],
  invalid: [
    {
      filename: '/repo/tests/integration/strict-adapters.test.ts',
      code: lines(
        'writeFileSync(',
        "  path.join(root, 'tsconfig.json'),",
        '  JSON.stringify({',
        "    compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', lib: ['ES2022'] },",
        "    include: ['src/**/*'],",
        '  }),',
        ');',
      ),
      errors: [{ messageId: 'unpinnedTsconfig', line: 4 }],
    },
    {
      filename: '/repo/tests/integration/static-checks-diff-policy.test.ts',
      code: lines(
        'const typeScriptConfig = JSON.stringify({',
        "  compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true },",
        "  include: ['src/**/*.ts'],",
        '});',
        "writeFiles(projectRoot, { 'tsconfig.json': `${typeScriptConfig}\\n` });",
      ),
      errors: [{ messageId: 'unpinnedTsconfig', line: 2 }],
    },
    {
      filename: testFile,
      code: 'const tsconfig = { compilerOptions: { types: [] } }; writeFileSync(file, JSON.stringify(tsconfig, undefined, 2));',
      errors: [{ messageId: 'unpinnedTsconfig' }],
    },
  ],
});
ruleTester.run('no-partial-output-assertion', noPartialOutputAssertion, {
  valid: [
    { filename: '/repo/test/report.test.ts', code: "expect(output).toEqual('a\\nb');" },
    { filename: '/repo/test/report.test.ts', code: "expect(output).toBe('a');" },
    { filename: '/repo/test/report.test.ts', code: "expect(output).not.toContain('secret');" },
    { filename: '/repo/test/report.test.ts', code: 'expect(output).not.toContain(`${a}`);' },
    { filename: '/repo/test/report.test.ts', code: 'expect(list).not.toContainEqual({ id: 1 });' },
    { filename: '/repo/test/report.test.ts', code: 'expect(list).toContain(item);' },
    { filename: '/repo/test/report.test.ts', code: "text.toContain('a');" },
    { filename: '/repo/test/report.test.ts', code: 'expect(output).not.toMatchObject({ a: 1 });' },
    { filename: '/repo/test/report.test.ts', code: 'matcher.toMatchObject({ a: 1 });' },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).not.toEqual(expect.objectContaining({ a: 1 }));',
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toEqual({ id: expect.any(String), tags: [expect.anything()] });',
    },
    { filename: '/repo/test/report.test.ts', code: 'expect(output).toEqual({ a: 1, b: [2, 3] });' },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toEqual({ a: expect.not.stringContaining('x') });",
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(send).toHaveBeenCalledWith(expect.objectContaining({ a: 1 }));',
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toEqual(build(expect.stringContaining('x')));",
    },
    { filename: '/repo/test/report.test.ts', code: 'expect(output).toEqual({ ...rest, a: 1 });' },
    { filename: '/repo/test/report.test.ts', code: 'expect(output).toEqual([, 1]);' },
  ],
  invalid: [
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toContain('fragment');",
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toContain(`line ${n}`);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(list).toContainEqual({ id: 1 });',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "await expect(promise).resolves.toContain('done');",
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect.soft(output).toContain('fragment');",
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(send()).toMatchObject({ channel: 'email' });",
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "await expect(send()).resolves.toMatchObject({ channel: 'email' });",
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(list).toMatchObject([{ id: 1 }]);',
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toEqual(expect.objectContaining({ a: 1 }));',
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toStrictEqual(expect.stringContaining('x'));",
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toEqual([expect.arrayContaining([1]), 2]);',
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toEqual({ to: 'a', body: expect.stringContaining('x') });",
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toEqual({ ...rest, nested: { items: [expect.objectContaining({ a: 1 })] } });',
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: 'expect(output).toEqual({ ...expect.objectContaining({ a: 1 }) });',
      errors: [{ messageId: 'partialMatcher' }],
    },
    {
      filename: '/repo/test/report.test.ts',
      code: "expect(output).toEqual({ a: expect.stringContaining('x'), b: expect.stringContaining('y') });",
      errors: [{ messageId: 'partialMatcher' }],
    },
  ],
});
ruleTester.run('fake clocks require explicit advancement', noWaitFor, {
  valid: [
    "it('real clock', async () => { await vi.waitFor(check); });",
    "it.each([1])('fake %s', () => { vi.useFakeTimers(); }); it('real sibling', async () => { await vi.waitFor(check); });",
    "it('fake', async () => { vi.useFakeTimers(); await vi.advanceTimersByTimeAsync(5); check(); });",
    "it('fake', () => { vi.useFakeTimers(); }); it('real', async () => { await vi.waitFor(check); }); afterEach(() => vi.useRealTimers());",
    "beforeEach(() => vi.useFakeTimers()); it('real override', async () => { vi.useRealTimers(); await vi.waitFor(check); });",
    "describe('fake', () => { beforeEach(() => vi.useFakeTimers()); it('direct', check); }); describe('real', () => { it('wait', async () => { await vi.waitFor(check); }); });",
  ],
  invalid: [
    {
      code: "it('fake', async () => { vi.useFakeTimers(); await vi.waitFor(check); });",
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: "test.each([1])('fake %s', async () => { vi.useFakeTimers(); await vi.waitFor(check); });",
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: "beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers()); it('fake', async () => { await vi.waitFor(check); });",
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: "describe('fake', () => { beforeEach(() => vi.useFakeTimers()); describe('nested', () => { it('wait', async () => { await vi.waitFor(check); }); }); });",
      errors: [{ messageId: 'fakeWait' }],
    },
    {
      code: "import { vi as clock } from 'vitest'; it('fake', async () => { clock.useFakeTimers(); await clock.waitFor(check); });",
      errors: [{ messageId: 'fakeWait' }],
    },
  ],
});
ruleTester.run('do not replace internal collaborators', noInternalMocks, {
  valid: [
    { filename, code: "vi.mock('undici');" },
    { filename, code: 'const serverFactory = () => fakeServer; start({ serverFactory });' },
    { filename, code: "import * as os from 'node:os'; vi.spyOn(os, 'hostname');" },
    { filename, code: "import * as helpers from './helpers.test.js'; vi.spyOn(helpers, 'make');" },
    {
      filename,
      code: "import * as domain from '../domain.js'; vi.spyOn(console, 'log'); run(domain);",
    },
    { filename, code: "import { leaf } from '../domain.js'; vi.spyOn(leaf, 'call');" },
  ],
  invalid: [
    {
      filename,
      code: "import * as domain from '../domain.js'; vi.spyOn(domain, 'leaf').mockReturnValue(1);",
      errors: [{ messageId: 'internalSpy', data: { source: '../domain.js' } }],
    },
    {
      filename,
      code: "import { vi as mocks } from 'vitest'; import * as domain from '../domain.js'; mocks.spyOn(domain, 'leaf');",
      errors: [{ messageId: 'internalSpy' }],
    },
    {
      filename,
      code: "vi.mock('../../logging/logger.js');",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      filename,
      code: "import { vi as mocks } from 'vitest'; mocks.mock('../../config.js');",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      filename,
      code: "import { run } from '../feature.js'; vi.mock('../collaborator.js'); run();",
      errors: [{ messageId: 'internalMock' }],
    },
    { filename, code: "vi.doMock('../collaborator.js');", errors: [{ messageId: 'internalMock' }] },
    {
      filename,
      code: "vi.mock(import('../collaborator.js'));",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      filename,
      code: "import { vi as mocks } from 'vitest'; mocks.mock('../collaborator.js');",
      errors: [{ messageId: 'internalMock' }],
    },
  ],
});
