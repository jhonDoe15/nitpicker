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
      code: 'try { execute(); } catch (error) { items.forEach((item) => { handle(item, error); }); }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { throw error; }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { throw new FeatureError('failed', { cause: error }); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch { throw new FeatureError('failed'); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { return { ok: true, value: execute() }; } catch (error) { return { ok: false, error }; }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "function parse(text) { try { return JSON.parse(text); } catch { return { kind: 'malformed-json' }; } }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { return toFailure(error); }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.warn('using fallback'); return toFailure(error); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error({ err: error }, 'failed'); throw error; }",
    },
    { filename: '/repo/src/main/feature.ts', code: 'try { execute(); } catch { useFallback(); }' },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.warn('bad'); recover(); }",
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { errors.push(error); }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { errors.push(String(error)); }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { this.lastError = error; }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { report.error = String(error); }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'let failure; try { execute(); } catch (error) { failure = error; } if (failure) { throw failure; }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { const message = String(error); notify(message); }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { return String(error); }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { return computeFallback(); }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { result = computeFallback(); }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'async function f() { try { await execute(); } catch (error) { await recover(error); } }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'async function f() { try { await execute(); } catch { await recover(); } }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'for (const item of items) { try { execute(item); } catch (error) { break; } }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { total += error.code; }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { if (isFatal(error)) { throw error; } return null; }',
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { cleanup?.(); }',
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch {}',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) {}',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'function read() { try { return load(); } catch { return undefined; } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'function read() { try { return load(); } catch { return null; } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'function read() { try { return load(); } catch (error) { return false; } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'function read() { try { return load(); } catch (error) { return -1; } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'function read() { try { return load(); } catch (error) { return []; } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'function read() { try { return load(); } catch (error) { return new Map(); } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'function read() { try { return load(); } catch (error) { return DEFAULT_PORT; } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'function read() { try { return load(); } catch (error) { return fallback; } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'function read() { try { return load(); } catch (error) { return Promise.resolve(); } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'function read() { try { load(); } catch (error) { return; } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'for (const item of items) { try { execute(item); } catch (error) { continue; } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { value = null; }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { counter += 1; }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { counter++; }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { errors.push(item); }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.warn('using fallback'); }",
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.error({ err: error }, 'failed'); }",
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { console.error(error); }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { console.log('bad'); return null; }",
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { this.logger.warn('bad', error); }",
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { request.log.error(error); return undefined; }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { logger.error(error); return null; }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { process.stderr.write(String(error)); }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: "try { execute(); } catch (error) { logger.warn('bad'); counter++; }",
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { const message = String(error); logger.warn(message); }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'let failure; try { execute(); } catch (error) { failure = error; }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { if (ignorable) { return null; } return undefined; }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { { return 0; } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { const unused = 0; }',
      errors: [{ messageId: 'silent' }],
    },
    {
      filename: '/repo/src/main/feature.ts',
      code: 'try { execute(); } catch (error) { const retry = () => { throw error; }; }',
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
