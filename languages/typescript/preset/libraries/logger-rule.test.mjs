import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { structuredCatchLoggingRule } from '../eslint-plugin/rules/errors/structured-catch-logging.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

const VALUE_MESSAGE = `Pass the caught value itself to the logger, for example logger.error('message', error), not its message or a template string`;
const EITHER_MESSAGE = `Log a caught value as logger.<level>({ err: error, ...context }, message), or pass the caught value itself, for example logger.error('message', error)`;
const ERR_MESSAGE = 'Log a caught value as logger.<level>({ err: error, ...context }, message).';

function inCatch(call) {
  return `try { run(); } catch (e) { ${call}; }`;
}

const CAUGHT_VALUE_FORMS = [
  inCatch("logger.error('failed', e)"),
  inCatch('logger.error(e)'),
  inCatch("logger.error('failed', { error: e })"),
  inCatch("logger.warn('failed', { cause: e, scope: 'import' })"),
  inCatch("logger.error({ error: e }, 'failed')"),
  inCatch("logger.error('failed', e as Error)"),
  inCatch("const failure = e; logger.error('failed', failure)"),
];
const MESSAGE_ONLY_FORMS = [
  inCatch('logger.error(`failed ${e.message}`)'),
  inCatch("logger.error('failed', e.message)"),
  inCatch("logger.error('failed', { error: e.message })"),
  inCatch("const message = e instanceof Error ? e.message : 'x'; logger.error('failed', message)"),
  inCatch("logger.error('failed ' + String(e))"),
];

for (const library of ['winston', 'log4js', 'loglevel', 'consola', 'tslog', 'roarr', 'signale']) {
  tester.run(`catch logging with ${library}`, structuredCatchLoggingRule({ logger: [library] }), {
    valid: CAUGHT_VALUE_FORMS,
    invalid: MESSAGE_ONLY_FORMS.map((code) => ({
      code,
      errors: [{ message: VALUE_MESSAGE }],
    })),
  });
}

tester.run(
  'catch logging with pino or bunyan',
  structuredCatchLoggingRule({ logger: ['bunyan'] }),
  {
    valid: [inCatch("logger.error({ err: e }, 'failed')")],
    invalid: [
      { code: inCatch("logger.error({ error: e }, 'failed')"), errors: [{ message: ERR_MESSAGE }] },
      { code: inCatch("logger.error('failed', e)"), errors: [{ message: ERR_MESSAGE }] },
    ],
  },
);

tester.run('catch logging without a detected logger', structuredCatchLoggingRule(undefined), {
  valid: [inCatch("logger.error({ err: e }, 'failed')")],
  invalid: [{ code: inCatch("logger.error('failed', e)"), errors: [{ message: ERR_MESSAGE }] }],
});

for (const logger of [
  ['winston', 'pino'],
  ['pino', 'winston'],
]) {
  tester.run(`catch logging with ${logger.join(' and ')}`, structuredCatchLoggingRule({ logger }), {
    valid: [inCatch("logger.error({ err: e }, 'failed')"), inCatch("logger.error('failed', e)")],
    invalid: [
      {
        code: inCatch('logger.error(`failed ${e.message}`)'),
        errors: [{ message: EITHER_MESSAGE }],
      },
    ],
  });
}
