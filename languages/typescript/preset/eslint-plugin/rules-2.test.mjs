import { RuleTester } from 'eslint';

import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';

import tseslint from 'typescript-eslint';

import { rule as integrationTestUsesApprovedHarness } from './rules/testing/processes/integration-test-uses-approved-harness.mjs';

import { rule as noMockingSubjectUnderTest } from './rules/testing/assertions/no-mocking-subject-under-test.mjs';

import { rule as noProductionConsole } from './rules/modules/no-production-console.mjs';

import { rule as noSilentCatch } from './rules/errors/no-silent-catch.mjs';

import { rule as noUnvalidatedSchemaField } from './rules/boundaries/no-unvalidated-schema-field.mjs';

import { rule as reportModuleLoadEffects } from './rules/modules/report-module-load-effects.mjs';

import { rule as structuredCatchLogging } from './rules/errors/structured-catch-logging.mjs';

import { rule as testMustUseProductionRuntime } from './rules/testing/assertions/test-must-use-production-runtime.mjs';

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
  },
});

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
  ],
});
ruleTester.run('no-silent-catch', noSilentCatch, {
  valid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.warn('using fallback'); return toFailure(error); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error({ err: error }, 'failed'); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { throw error; }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { return { ok: true, value: execute() }; } catch (error) { return { ok: false, error }; }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { throw new FeatureError('failed', { cause: error }); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "function parse(text) { try { return JSON.parse(text); } catch { return { kind: 'malformed-json' }; } }",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch { useFallback(); }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'function read() { try { return load(); } catch { return undefined; } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { useFallback(); }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.warn('using fallback'); }",
      errors: [{ messageId: 'silent' }],
    },
  ],
});
ruleTester.run('no-unvalidated-schema-field', noUnvalidatedSchemaField, {
  valid: [
    "import { z } from 'zod'; const s = z.object({ name: z.string().trim().min(1), email: z.email() });",
    "import { z } from 'zod'; const s = z.array(z.unknown());",
    "import { z } from 'zod'; const s = z.unknown();",
    "import { z } from 'zod'; const s = z.object({ items: z.array(z.string()) });",
    "import { z } from 'zod'; const s = z.object({ value: z.unknown().refine(isPrice) });",
    "import { z } from 'zod'; const s = z.object({ value: z.unknown().pipe(z.string()) });",
    "import { z } from 'zod'; const s = z.object({ ...base, id: z.string() });",
    "import { z } from 'zod'; const s = z.object(shape);",
    'const s = schemas.object({ value: schemas.unknown() });',
    'const s = z.object({ value: unknown() });',
  ],
  invalid: [
    {
      code: "import { z } from 'zod'; const s = z.object({ name: z.unknown() });",
      errors: [{ messageId: 'unvalidatedField', data: { factory: 'z.unknown' } }],
    },
    {
      code: "import { z } from 'zod'; const s = z.object({ name: z.any() });",
      errors: [{ messageId: 'unvalidatedField', data: { factory: 'z.any' } }],
    },
    {
      code: "import { z } from 'zod'; const s = z.object({ name: z.unknown().optional() });",
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: "import { z } from 'zod'; const s = z.strictObject({ a: z.string(), b: z.any().nullable().describe('x') });",
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: "import { z } from 'zod'; const s = z.object({ a: z.unknown(), b: z.unknown() });",
      errors: [{ messageId: 'unvalidatedField' }, { messageId: 'unvalidatedField' }],
    },
    {
      code: "import { z } from 'zod'; const s = z.array(z.object({ inner: z.object({ id: z.unknown() }) }));",
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: "import * as validators from 'zod'; const s = validators.object({ id: validators.unknown() });",
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: "import { z as schema } from 'zod/v4'; const s = schema.object({ id: schema.any() });",
      errors: [{ messageId: 'unvalidatedField' }],
    },
  ],
});
ruleTester.run('no-production-console', noProductionConsole, {
  valid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "logger.warn({ component: 'feature' }, 'degraded');",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "console.warn('degraded');",
      errors: [{ messageId: 'consoleCall', data: { method: 'warn' } }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "console.error('failed');",
      errors: [{ messageId: 'consoleCall', data: { method: 'error' } }],
    },
  ],
});
ruleTester.run('structured-catch-logging', structuredCatchLogging, {
  valid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error({ err: error, operation: 'execute' }, 'failed'); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.warn({ err: toError(error) }, 'degraded'); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "logger.error({ error: 'business-state' }, 'business failure');",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error(error, 'failed'); }",
      errors: [{ messageId: 'caughtErrorShape' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error({ error }, 'failed'); }",
      errors: [{ messageId: 'caughtErrorShape' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error({ err: error }, { operation: 'execute' }, 'failed'); }",
      errors: [{ messageId: 'caughtErrorShape' }],
    },
  ],
});
ruleTester.run('report-module-load-effects', reportModuleLoadEffects, {
  valid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: "import { initialize } from './runtime.js'; export function start() { initialize(); if (enabled()) { configure(); } }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "'use strict'; const labels = new Set(['one']); export class Deferred { start() { return run(); } }",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/bootstrap.ts',
      code: "import './side-effect.js';",
      errors: [{ messageId: 'sideEffectImport' }],
    },
    {
      filename: '/repo/src/main/bootstrap.ts',
      code: 'initialize();',
      errors: [{ messageId: 'topLevelExpression' }],
    },
    {
      filename: '/repo/src/main/bootstrap.ts',
      code: 'if (enabled()) { initialize(); }',
      errors: [{ messageId: 'topLevelControl' }],
    },
    {
      filename: '/repo/src/main/bootstrap.ts',
      code: 'await initialize();',
      errors: [{ messageId: 'topLevelAwait' }],
    },
    {
      filename: '/repo/src/main/bootstrap.ts',
      code: 'export class Registry { static { initialize(); } }',
      errors: [{ messageId: 'staticBlock' }],
    },
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
