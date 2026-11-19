import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { noInterpolatedLogMessageRule } from './no-interpolated-log-message.mts';

const tester = typescriptRuleTester();
const IMPORTS = {
  pino: "import pino from 'pino';\nconst log = pino();\n",
  bunyan: "import bunyan from 'bunyan';\nconst log = bunyan.createLogger({ name: 'app' });\n",
  winston: "import winston from 'winston';\nconst log = winston.createLogger({});\n",
} as const;
const FIELDS = {
  pino: { messageId: 'structuredFields' as const, data: { library: 'pino' } },
  bunyan: { messageId: 'structuredFields' as const, data: { library: 'bunyan' } },
  winston: { messageId: 'trailingFields' as const, data: { library: 'winston' } },
};
const ALLOWED: Record<keyof typeof IMPORTS, readonly string[]> = {
  pino: ["log.info({ orderId }, 'loaded order');", "log.info({ id }, `loaded @{'x'}`);"],
  bunyan: ["log.warn({ orderId }, 'loaded order');", "log.info(err, 'failed ' + 'again');"],
  winston: ["log.info('loaded order', { orderId });", "log.error('loaded %s', id);"],
};
const COMMON_ALLOWED = [
  "log.info('loaded order');",
  'log.info(`loaded order`);',
  "log.info('loaded ' + 'order');",
  'log.info(message);',
  "log.child({ id }).info('loaded');",
  'console.info(`loaded @{id}`);',
  'other.info(`loaded @{id}`);',
  'log.log(`loaded @{id}`);',
];
const BANNED = [
  'log.info(`loaded order @{id}`);',
  "log.warn('retry ' + attempt);",
  "log.error('failed ' + 'to load ' + name);",
  'log.fatal(`a @{b}`);',
  "log.debug(('loaded ' + id) as string);",
];
const BANNED_FIELDS_FIRST = [
  'log.error(err, `failed @{id}`);',
  'log.info({ id }, `loaded order @{id}`);',
  "log.trace({ id }, 'retry ' + attempt);",
];

for (const library of ['pino', 'bunyan', 'winston'] as const) {
  for (const extension of ['ts', 'js']) {
    const filename = `/repo/src/service.${extension}`;
    const prefix = IMPORTS[library];
    const banned = library === 'winston' ? BANNED : [...BANNED, ...BANNED_FIELDS_FIRST];
    tester.run(
      `no-interpolated-log-message for ${library} in ${extension}`,
      noInterpolatedLogMessageRule({ logger: [library] }),
      {
        valid: [...ALLOWED[library], ...COMMON_ALLOWED].map((code) => ({
          filename,
          code: `${prefix}${code.replaceAll('@{', '${')}`,
        })),
        invalid: banned
          .filter((code) => extension === 'ts' || !code.includes(' as '))
          .map((code) => ({
            filename,
            code: `${prefix}${code.replaceAll('@{', '${')}`,
            errors: [FIELDS[library]],
          })),
      },
    );
  }
}

tester.run(
  'no-interpolated-log-message without a logging library',
  noInterpolatedLogMessageRule({}),
  {
    valid: [
      { filename: '/repo/src/service.ts', code: `${IMPORTS.pino}log.info(\`loaded @{id}\`);` },
    ],
    invalid: [],
  },
);
