import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { typedTsProject } from '../../test-support/projects/typed-ts-project.mts';
import { noDroppedLogArgumentsRule } from './no-dropped-log-arguments.mts';

const PACKAGES: Record<string, string> = {
  pino: [
    'declare namespace pino {',
    '  interface Logger {',
    '    info(message: string, ...values: unknown[]): void;',
    '    info(fields: object, message?: string, ...values: unknown[]): void;',
    '    error(message: string, ...values: unknown[]): void;',
    '    error(fields: object, message?: string, ...values: unknown[]): void;',
    '    child(fields: object): Logger;',
    '  }',
    '}',
    'declare function pino(): pino.Logger;',
    'export = pino;',
  ].join('\n'),
  winston: [
    'export interface Logger {',
    '  info(message: string, ...values: unknown[]): void;',
    '  child(fields: object): Logger;',
    '}',
    'export declare function createLogger(options?: object): Logger;',
  ].join('\n'),
};

const project = typedTsProject('nitpicker-dropped-log-', {
  typeScriptOnly: true,
  prepare(root) {
    for (const [name, declarations] of Object.entries(PACKAGES)) {
      const folder = path.join(root, 'node_modules', name);
      mkdirSync(folder, { recursive: true });
      writeFileSync(path.join(folder, 'index.d.ts'), `${declarations}\n`);
      writeFileSync(
        path.join(folder, 'package.json'),
        JSON.stringify({ name, version: '1.0.0', types: 'index.d.ts' }),
      );
    }
  },
});

function typed(code: string) {
  return { filename: project.write(code, 'ts'), code };
}

const OWNER = [
  "import type pino from 'pino';",
  "import type { Logger } from 'winston';",
  'declare const config: { a: number };',
  'declare const text: string;',
  'declare const items: string[];',
  'declare const failure: Error;',
  'declare const pinoLog: pino.Logger;',
  'declare const winstonLog: Logger;',
  'declare const other: { info(message: string, ...values: unknown[]): void };',
  '',
].join('\n');

const bothLibraries = noDroppedLogArgumentsRule({ logger: ['pino', 'winston'] });

project.tester.run('no-dropped-log-arguments with types', bothLibraries, {
  valid: [
    "pinoLog.info({ config }, 'loaded config');",
    "pinoLog.info(failure, 'failed');",
    "pinoLog.info('loaded %s', text);",
    "other.info('loaded config', config);",
    "winstonLog.info('loaded config', config);",
    "winstonLog.info('loaded %s', text);",
    "class Service { private readonly log!: pino.Logger; run() { this.log.info({ config }, 'x'); } }",
  ].map((body) => typed(`${OWNER}${body}`)),
  invalid: [
    {
      ...typed(`${OWNER}pinoLog.info('loaded config', config);`),
      errors: [
        { messageId: 'droppedValues' as const, data: { library: 'pino', values: '`config`' } },
      ],
    },
    {
      ...typed(`${OWNER}pinoLog.info(config, 'loaded', items);`),
      errors: [
        { messageId: 'droppedValues' as const, data: { library: 'pino', values: '`items`' } },
      ],
    },
    {
      ...typed(`${OWNER}pinoLog.child({ a: 1 }).info('loaded config', config);`),
      errors: [
        { messageId: 'droppedValues' as const, data: { library: 'pino', values: '`config`' } },
      ],
    },
    {
      ...typed(
        `${OWNER}class Service { private readonly log!: pino.Logger; run() { this.log.info(failure, 'failed', text); } }`,
      ),
      errors: [
        { messageId: 'droppedValues' as const, data: { library: 'pino', values: '`text`' } },
      ],
    },
  ],
});

project.tester.run('no-dropped-log-arguments with a typed winston logger', bothLibraries, {
  valid: [
    `${OWNER}winstonLog.info('loaded %s', text);`,
    "import { createLogger } from 'winston';\nconst logger = createLogger({ format: makeFormat() });\ndeclare function makeFormat(): object;\nlogger.info('loaded %s', 'x');",
  ].map((code) => typed(code)),
  invalid: [
    {
      ...typed(
        "import { createLogger } from 'winston';\nconst logger = createLogger();\nlogger.info('loaded %s', 'x');",
      ),
      errors: [{ messageId: 'winstonSplat' as const, data: { values: "`'x'`" } }],
    },
  ],
});
