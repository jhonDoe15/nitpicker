import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { noDroppedLogArgumentsRule } from './no-dropped-log-arguments.mts';

const tester = typescriptRuleTester();
const filename = '/repo/src/service.ts';
const withPino = noDroppedLogArgumentsRule({ logger: ['pino'] });

const PINO = "import pino from 'pino';\nconst log = pino();\n";
const BUNYAN = "import bunyan from 'bunyan';\nconst log = bunyan.createLogger({ name: 'app' });\n";
const WINSTON = "import winston from 'winston';\n";

function dropped(values: string, library = 'pino') {
  return { messageId: 'droppedValues' as const, data: { library, values } };
}

tester.run('no-dropped-log-arguments for pino', withPino, {
  valid: [
    "log.info({ config }, 'loaded config');",
    "log.info('loaded %s', name);",
    "log.info('loaded %s of %d', name, count);",
    "log.info('100%% done');",
    "log.info('100%% of %s', name);",
    "log.info({ a: 1 }, 'loaded %s', name);",
    "log.info('loaded');",
    'log.info(`loaded %s`, name);',
    'log.info(message, extra);',
    'log.info(...args);',
    "console.log('loaded config', config);",
    "console.info('loaded %s', 'a', 'b');",
    "util.format('loaded config', config);",
    "other.info('loaded config', config);",
    "log.info({ err }, 'failed');",
    "log.info(new Error('x'), 'failed');",
    `log.info(\`loaded \${name}\`, config);`,
    "log.log('loaded config', config);",
  ].map((code) => ({ filename, code: `${PINO}${code}` })),
  invalid: [
    { code: "log.info('loaded config', { a: 1 });", values: '`{ a: 1 }`' },
    { code: "log.info('loaded config', config);", values: '`config`' },
    { code: 'log.error(`loaded config`, config);', values: '`config`' },
    { code: "log.info('loaded %s', 'x', 'extra');", values: "`'extra'`" },
    { code: "log.warn({ id }, 'loaded', config, other);", values: '`config`, `other`' },
    { code: "log.fatal(new Error('x'), 'failed', detail);", values: '`detail`' },
    { code: "log.debug('100%% of %s', name, total);", values: '`total`' },
    { code: "log.trace('loaded config', a, b);", values: '`a`, `b`' },
  ].map(({ code, values }) => ({
    filename,
    code: `${PINO}${code}`,
    errors: [dropped(values)],
  })),
});

tester.run('no-dropped-log-arguments for pino placeholders without values', withPino, {
  valid: [],
  invalid: [
    {
      filename,
      code: `${PINO}log.info('loaded %s %s', 'x');`,
      errors: [
        {
          messageId: 'missingValues',
          data: { library: 'pino', placeholders: '2', given: '1' },
        },
      ],
    },
    {
      filename,
      code: `${PINO}log.info({ a }, 'loaded %d');`,
      errors: [
        { messageId: 'missingValues', data: { library: 'pino', placeholders: '1', given: '0' } },
      ],
    },
  ],
});

tester.run('no-dropped-log-arguments for pino factories and children', withPino, {
  valid: [
    "const log = require('pino')();\nlog.info({ config }, 'loaded config');",
    "const pino = require('pino');\nconst log = pino();\nlog.child({ a }).info('x %s', y);",
    "import { other } from 'pino';\nconst log = other();\nlog.info('loaded config', config);",
    "const log = pino();\nlog.info('loaded config', config);",
    'function run(log) { log.info("loaded config", config); }',
  ].map((code) => ({ filename, code })),
  invalid: [
    "const log = require('pino')();\nlog.info('loaded config', config);",
    "const pino = require('pino');\nconst log = pino({ level: 'info' });\nlog.info('loaded config', config);",
    "import { pino } from 'pino';\nconst log = pino();\nlog.info('loaded config', config);",
    "import * as pinoLib from 'pino';\nconst log = pinoLib.default();\nlog.info('loaded config', config);",
    `${PINO}const child = log.child({ a: 1 });\nchild.info('loaded config', config);`,
    `${PINO}log.child({ a: 1 }).info('loaded config', config);`,
    "const { pino: make } = require('pino');\nconst log = make();\nlog.error('loaded config', config);",
  ].map((code) => ({ filename, code, errors: [dropped('`config`')] })),
});

tester.run(
  'no-dropped-log-arguments for bunyan',
  noDroppedLogArgumentsRule({ logger: ['bunyan'] }),
  {
    valid: [
      "log.info({ config }, 'loaded config');",
      "log.info('loaded %s', name);",
      "log.info('loaded config', config);",
      "log.info('loaded %s', name, extra);",
    ].map((code) => ({ filename, code: `${BUNYAN}${code}` })),
    invalid: [
      {
        filename,
        code: `${BUNYAN}log.info('loaded %s %d', name);`,
        errors: [
          {
            messageId: 'missingValues',
            data: { library: 'bunyan', placeholders: '2', given: '1' },
          },
        ],
      },
    ],
  },
);

tester.run(
  'no-dropped-log-arguments without a logger library',
  noDroppedLogArgumentsRule({ logger: ['log4js'] }),
  {
    valid: [{ filename, code: `${PINO}log.info('loaded config', config);` }],
    invalid: [],
  },
);

const withWinston = noDroppedLogArgumentsRule({ logger: ['winston'] });
const PLAIN = `${WINSTON}const logger = winston.createLogger({ transports: [new winston.transports.Console()] });\n`;
const SPLAT = `${WINSTON}const { format } = winston;\nconst logger = winston.createLogger({\n  format: format.combine(format.splat(), format.json()),\n});\n`;

function splatDropped(values: string) {
  return { messageId: 'winstonSplat' as const, data: { values } };
}
function extraDropped(values: string) {
  return { messageId: 'winstonExtra' as const, data: { values } };
}

tester.run('no-dropped-log-arguments for winston', withWinston, {
  valid: [
    `${SPLAT}logger.info('loaded %s', 'x');`,
    `${SPLAT}logger.info('loaded', 'x');`,
    `${PLAIN}logger.info('loaded config', { a: 1 });`,
    `${PLAIN}logger.info('loaded config', config);`,
    `${PLAIN}logger.info('loaded config', new Error('x'));`,
    `${PLAIN}logger.info('loaded');`,
    `${PLAIN}logger.info('100%% done');`,
    `${PLAIN}logger.info({ message: 'loaded' });`,
    `${PLAIN}console.log('loaded %s', 'x', 'y');`,
    "logger.info('loaded %s', 'x');",
    "import winston from 'winston';\nconst logger = winston.createLogger(options);\nlogger.info('loaded %s', 'x');",
    "import winston from 'winston';\nimport { format } from './formats';\nconst logger = winston.createLogger({ format });\nlogger.info('loaded %s', 'x');",
    "import winston from 'winston';\nconst logger = winston.createLogger({ ...base });\nlogger.info('loaded %s', 'x');",
    `${WINSTON}const logger = winston.createLogger({ transports: [new winston.transports.Console({ format: winston.format.splat() })] });\nlogger.info('loaded %s', 'x');`,
    `${WINSTON}const format = winston.format.combine(winston.format.splat());\nconst logger = winston.createLogger({ format });\nlogger.info('loaded %s', 'x');`,
    `${SPLAT}logger.child({ a: 1 }).info('loaded %s', 'x');`,
  ].map((code) => ({ filename, code })),
  invalid: [
    { code: `${PLAIN}logger.info('loaded %s', 'x');`, errors: [splatDropped("`'x'`")] },
    { code: `${PLAIN}logger.warn('a %s %d', x, y);`, errors: [splatDropped('`x`, `y`')] },
    {
      code: `${PLAIN}logger.error('failed %s', name, { id });`,
      errors: [splatDropped('`name`, `{ id }`')],
    },
    { code: `${PLAIN}logger.info('loaded', 'x');`, errors: [extraDropped("`'x'`")] },
    { code: `${PLAIN}logger.info('loaded', 3);`, errors: [extraDropped('`3`')] },
    {
      code: `${PLAIN}logger.info('loaded', { a: 1 }, 'extra');`,
      errors: [extraDropped("`'extra'`")],
    },
    {
      code: `${PLAIN}logger.child({ a: 1 }).info('loaded %s', 'x');`,
      errors: [splatDropped("`'x'`")],
    },
    {
      code: "import { createLogger } from 'winston';\nconst logger = createLogger();\nlogger.info('loaded %s', 'x');",
      errors: [splatDropped("`'x'`")],
    },
    {
      code: "const winston = require('winston');\nconst logger = winston.createLogger({ level: process.env.LEVEL || 'info' });\nlogger.info('loaded %s', 'x');",
      errors: [splatDropped("`'x'`")],
    },
    {
      code: `${WINSTON}const logger = winston.createLogger({ format: winston.format.json() });\nlogger.info('loaded %s', 'x');`,
      errors: [splatDropped("`'x'`")],
    },
    {
      code: "import { createLogger, format } from 'winston';\nconst logger = createLogger({ format: format.combine(format.json()) });\nlogger.info('loaded %s', 'x');",
      errors: [splatDropped("`'x'`")],
    },
    {
      code: `${WINSTON}const { format } = winston;\nconst logger = winston.createLogger({ format: format.json() });\nlogger.info('loaded %s', 'x');`,
      errors: [splatDropped("`'x'`")],
    },
  ].map((test) => ({ filename, ...test })),
});
