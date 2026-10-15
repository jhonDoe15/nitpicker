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

const filename = '/repo/src/main/feature.ts';

const handledCatches = [
  "try { execute(); } catch (error) { logger.warn('using fallback'); return toFailure(error); }",
  'try { execute(); } catch (error) { throw error; }',
  'try { return { ok: true, value: execute() }; } catch (error) { return { ok: false, error }; }',
  "try { execute(); } catch (error) { throw new FeatureError('failed', { cause: error }); }",
  "function parse(text) { try { return JSON.parse(text); } catch { return { kind: 'malformed-json' }; } }",
  'function parse(text) { try { return load(text); } catch (error) { if (isMissing(error)) return undefined; throw error; } }',
  "function parse(text) { try { return load(text); } catch { return fail('unreadable'); } }",
  "function parse(text) { try { return load(text); } catch { return Result.err('unreadable'); } }",
  'function parse(text) { try { return load(text); } catch { return { ok: false }; } }',
  "function parse(text) { try { return load(text); } catch { return { status: 'error' }; } }",
  'try { execute(); } catch (error) { reject(error); }',
  'try { execute(); } catch (error) { setError(error); }',
  'try { execute(); } catch (error) { lastError = error; }',
  'try { execute(); } catch (error) { state.error = error; }',
  'try { execute(); } catch (error) { const wrapped = { error }; errors.push(wrapped); }',
  'try { execute(); } catch (error) { process.stderr.write(String(error)); process.exitCode = 1; }',
  "try { execute(); } catch (error) { logger.error({ err: error }, 'failed'); process.exit(1); }",
  'function read() { try { return load(); } catch (error) { return `failed: ${error.message}`; } }',
  'function read(): Error | Order { try { return load(); } catch (error) { return error; } }',
  'function read() { try { return load(); } catch (error) { return error; } }',
  "try { execute(); } catch (error) { logger.error({ err: error }, 'failed'); res.status(500).send('failed'); }",
  "try { execute(); } catch (error) { logger.error({ err: error }, 'failed'); reply.code(503).send(); }",
  "try { execute(); } catch (error) { logger.error({ err: error }, 'failed'); res.statusCode = 500; }",
  "async function GET() { try { return Response.json(await load()); } catch { return Response.json({ message: 'failed' }, { status: 500 }); } }",
  'async function GET() { try { return NextResponse.json(await load()); } catch { return NextResponse.json({}, { status: 502 }); } }',
  "try { await save(); } catch (caught) { logger.error({ err: caught }, 'save'); setError(t('orders.saveFailed')); }",
  "try { await save(); } catch (caught) { logger.error({ err: caught }, 'save'); toast.error('Saving failed'); }",
  "try { await save(); } catch (caught) { logger.error({ err: caught }, 'save'); setStatus('error'); }",
  "try { await save(); } catch { enqueueSnackbar('Saving failed', { variant: 'error' }); }",
  'load().catch((error) => { throw new FeatureError("failed", { cause: error }); });',
  'load().catch((error) => reject(error));',
  "load().catch(() => ({ ok: false, reason: 'unavailable' }));",
  'load().catch(handleError);',
];

const silentCatches = [
  'try { execute(); } catch { useFallback(); }',
  'function read() { try { return load(); } catch { return undefined; } }',
  'try { execute(); } catch (error) { useFallback(); }',
  "try { execute(); } catch (error) { logger.warn('using fallback'); }",
  "try { execute(); } catch (error) { logger.error({ err: error }, 'failed'); }",
  "function read() { try { return load(); } catch (error) { logger.error({ err: error }, 'failed'); return ''; } }",
  "function read() { try { return load(); } catch (error) { logger.error({ err: error }, 'failed'); return []; } }",
  'function read() { try { return load(); } catch (error) { void error; return ""; } }',
  'function read() { try { return load(); } catch (error) { const unused = error; return unused ? "" : ""; } }',
  'function read() { try { return load(); } catch { return {}; } }',
  'function read() { try { return load(); } catch (error) { console.error(String(error)); return { items: [] }; } }',
  'try { execute(); } catch (error) { process.stderr.write(String(error)); }',
  'try { execute(); } catch (error) { console.log(`failed ${error}`); }',
  'function read() { try { return load(); } catch (error) { if (error instanceof Missing) return null; useFallback(); } }',
  'function read() { try { return load(); } catch { return { ok: true, items: [] }; } }',
  "function read() { try { return load(); } catch { return { type: 'list', status: 200 }; } }",
  'try { execute(); } catch (error) { ignore(error); }',
  'function read(): number { try { return load(); } catch (error) { return error; } }',
  "try { await save(); } catch (caught) { logger.error({ err: caught }, 'save'); res.status(200).send('ok'); }",
  'try { await save(); } catch (caught) { setOpen(false); }',
  'load().catch(() => undefined);',
  'load().catch((error) => logger.error({ err: error }, "load"));',
  'load().catch(() => { return []; });',
];

ruleTester.run('no-silent-catch', noSilentCatch, {
  valid: handledCatches.map((code) => ({ filename, code })),
  invalid: silentCatches.map((code) => ({ filename, code, errors: [{ messageId: 'silent' }] })),
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
    "try { load(); } catch (error) { throw new Error('bounded external failure'); }",
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
