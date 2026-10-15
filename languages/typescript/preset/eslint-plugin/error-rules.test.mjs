import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noSilentCatch } from './rules/errors/no-silent-catch.mjs';
import { rule as preserveErrorCause } from './rules/errors/preserve-error-cause.mjs';
import { rule as structuredCatchLogging } from './rules/errors/structured-catch-logging.mjs';

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
ruleTester.run('keep caught causes in the Pino serializer', structuredCatchLogging, {
  valid: [
    "try { load(); } catch (error) { logger.warn({ err: error }, 'failed'); }",
    "try { load(); } catch (error) { const fields = { err: error, category: 'network' }; logger.error(fields, 'failed'); }",
  ],
  invalid: [
    {
      code: "try { load(); } catch (error) { const message = error instanceof Error ? error.message : 'failed'; logger.warn({ error: message }, 'failed'); }",
      errors: [{ messageId: 'caughtErrorShape' }],
    },
    {
      code: "try { load(); } catch (error) { logger.warn({ err: error.message }, 'failed'); }",
      errors: [{ messageId: 'caughtErrorShape' }],
    },
  ],
});
ruleTester.run('preserve wrapped error causes', preserveErrorCause, {
  valid: [
    'try { load(); } catch (error) { throw normalizeFailure(error); }',
    "try { load(); } catch (error) { throw new Error('failed', { cause: error }); }",
    {
      code: "try { load(); } catch (error) { throw new DomainFailure('invalid-input'); }",
      options: [
        {
          wrappers: [
            {
              name: 'DomainFailure',
              optionsIndex: 2,
              classificationIndex: 0,
              unclassifiedValue: 'unknown',
            },
          ],
        },
      ],
    },
    {
      code: "try { load(); } catch (error) { throw new DomainFailure('unknown', undefined, { cause: error }); }",
      options: [
        {
          wrappers: [
            {
              name: 'DomainFailure',
              optionsIndex: 2,
              classificationIndex: 0,
              unclassifiedValue: 'unknown',
            },
          ],
        },
      ],
    },
  ],
  invalid: [
    {
      code: "try { load(); } catch (error) { throw new Error('bounded external failure'); }",
      errors: [{ messageId: 'lostCause' }],
    },
    {
      code: 'try { load(); } catch (error) { throw new Error(error.message); }',
      errors: [{ messageId: 'lostCause' }],
    },
    {
      code: "try { load(); } catch (error) { throw new DomainFailure('unknown'); }",
      options: [
        {
          wrappers: [
            {
              name: 'DomainFailure',
              optionsIndex: 2,
              classificationIndex: 0,
              unclassifiedValue: 'unknown',
            },
          ],
        },
      ],
      errors: [{ messageId: 'lostCause' }],
    },
  ],
});
