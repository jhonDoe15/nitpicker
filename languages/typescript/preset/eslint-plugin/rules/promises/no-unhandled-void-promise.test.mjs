import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-unhandled-void-promise.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-void-promise-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      allowJs: true,
      checkJs: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2022', 'ESNext.Disposable'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));
writeFileSync(
  path.join(root, 'src/jobs.ts'),
  [
    'declare function report(id: string): Promise<void>;',
    'declare const logger: { error(value: unknown): void };',
    'export async function sendReport(id: string): Promise<void> {',
    '  try { await report(id); } catch (error) { logger.error({ error }); }',
    '}',
    'export async function sendRaw(id: string): Promise<void> { await report(id); }',
    'export function runDetached(task: () => Promise<void>): Promise<void> { return task(); }',
  ].join('\n'),
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

const PRELUDE = [
  'declare function report(id: string): Promise<void>;',
  'declare function count(): number;',
  'declare const logger: { error(value: unknown): void; flush(): Promise<void> };',
].join('\n');

function typed(body, { invalid = false, options, extension = 'ts' } = {}) {
  const file = path.join(root, `src/case-${randomUUID()}.${extension}`);
  const code = extension === 'ts' ? `${PRELUDE}\n${body}` : body;
  writeFileSync(file, code);
  return {
    filename: file,
    code,
    ...(options === undefined ? {} : { options }),
    ...(invalid ? { errors: [{ messageId: 'unhandledVoidPromise' }] } : {}),
  };
}

const catching = (body) =>
  `async function send(id: string) { try { ${body} } catch (error) { logger.error(error); } }`;

tester.run('no-unhandled-void-promise', rule, {
  valid: [
    typed(
      'const send = (async (id: string) => { try { await report(id); } catch (error) { logger.error(error); } });\nexport function start() { void send("a"); }',
    ),
    typed(`${catching('await report(id);')}\nexport function start() { void send('a'); }`),
    typed(
      'export function start() { void (async () => { try { await report("a"); } catch (error) { logger.error(error); } })(); }',
    ),
    typed(
      "import { sendReport } from './jobs';\nexport function start() { void sendReport('a'); }",
    ),
    typed(
      "import { runDetached } from './jobs';\nexport function start() { void runDetached(() => report('a')); }",
      { options: [{ runners: ['runDetached'] }] },
    ),
    typed(
      "import * as jobs from './jobs';\nexport function start() { void jobs.runDetached(() => report('a')); }",
      { options: [{ runners: ['runDetached'] }] },
    ),
    typed(
      `class Reports { ${catching('await report(id);').replace('async function', 'async')}\n  start() { void this.send('a'); } }\nexport { Reports };`,
    ),
    typed('export function start() { void count(); }'),
    typed('export function start(value: unknown) { void value; }'),
    typed(
      `async function send(id: string) { try { await report(id); } catch (error) { try { await logger.flush(); } catch (flushError) { logger.error(flushError); } } }\nexport function start() { void send('a'); }`,
    ),
    typed(
      `async function send(id: string) { try { return await report(id); } catch (error) { logger.error(error); } }\nexport function start() { void send('a'); }`,
    ),
    typed(
      [
        'async function send() { try { await Promise.resolve(); } catch (error) { console.error(error); } }',
        'export function start() { void send(); }',
      ].join('\n'),
      { extension: 'js' },
    ),
  ],
  invalid: [
    typed(
      `async function send(id: string) { try { await report(id); } catch (error) { report('b'); } }\nexport function start() { void send('a'); }`,
      { invalid: true },
    ),
    typed(
      `async function send(id: string) { try { await report(id); } catch (error) { logger.error(error); } finally { logger.flush(); } }\nexport function start() { void send('a'); }`,
      { invalid: true },
    ),
    typed(
      `async function send(id: string) { try { await report(id); } catch (error) { const retry = async () => { await report(id); }; retry(); } }\nexport function start() { void send('a'); }`,
      { invalid: true },
    ),
    typed(
      `async function send(id: string) { try { await report(id); } catch (error) { await using handle = { [Symbol.asyncDispose]: () => report(id) }; logger.error(handle); } }\nexport function start() { void send('a'); }`,
      { invalid: true },
    ),
    typed(
      'let send = async (id: string) => { try { await report(id); } catch (error) { logger.error(error); } };\nsend = async (id: string) => { await report(id); };\nexport function start() { void send("a"); }',
      { invalid: true },
    ),
    typed("export function start() { void report('a'); }", { invalid: true }),
    typed("import { sendRaw } from './jobs';\nexport function start() { void sendRaw('a'); }", {
      invalid: true,
    }),
    typed(
      "import { runDetached } from './jobs';\nexport function start() { void runDetached(() => report('a')); }",
      { invalid: true },
    ),
    typed('export function start(job: Promise<void>) { void job; }', { invalid: true }),
    typed('export function start(job: Promise<void> | undefined) { void job; }', { invalid: true }),
    typed("export function start() { void Promise.all([report('a')]); }", { invalid: true }),
    typed("export function start() { void report('a'); }", {
      invalid: true,
      options: [{ runners: ['runDetached'] }],
    }),
    typed(
      `async function send(id: string) { const key = id.trim(); try { await report(key); } catch (error) { logger.error(error); } }\nexport function start() { void send('a'); }`,
      { invalid: true },
    ),
    typed(
      `async function send(id: string) { try { await report(id); } catch (error) { throw new Error('failed', { cause: error }); } }\nexport function start() { void send('a'); }`,
      { invalid: true },
    ),
    typed(
      `async function send(id: string) { try { await report(id); } catch (error) { await logger.flush(); } }\nexport function start() { void send('a'); }`,
      { invalid: true },
    ),
    typed(
      `async function send(id: string) { try { return report(id); } catch (error) { logger.error(error); } }\nexport function start() { void send('a'); }`,
      { invalid: true },
    ),
    typed(
      `async function send(id: string) { try { await report(id); } catch (error) { logger.error(error); } finally { await logger.flush(); } }\nexport function start() { void send('a'); }`,
      { invalid: true },
    ),
    typed(
      `async function send(id: string) { try { await report(id); } finally { logger.error(id); } }\nexport function start() { void send('a'); }`,
      { invalid: true },
    ),
    typed("export function start() { void (async () => { await report('a'); })(); }", {
      invalid: true,
    }),
    typed(
      'interface Sender { send(id: string): Promise<void> }\nexport function start(sender: Sender) { void sender.send("a"); }',
      { invalid: true },
    ),
    typed(
      [
        'async function send() { await Promise.resolve(); }',
        'export function start() { void send(); }',
      ].join('\n'),
      { invalid: true, extension: 'js' },
    ),
  ],
});
