import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './no-cached-rejection.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-cached-rejection-')));
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
      lib: ['ES2022'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

const PRELUDE = 'declare function connect(): Promise<string>;\ndeclare function count(): number;\n';

function typed(body, messageId, extension = 'ts') {
  const file = path.join(root, `src/case-${randomUUID()}.${extension}`);
  const code = extension === 'ts' ? `${PRELUDE}${body}` : body;
  writeFileSync(file, code);
  return { filename: file, code, ...(messageId === undefined ? {} : { errors: [{ messageId }] }) };
}

const inClass = (body) => `class Client { private conn?: Promise<string>; ${body} }`;
const inModule = (body) => `let conn: Promise<string> | undefined;\n${body}`;

const SAFE_CATCH =
  'const attempt = connect(); this.conn = attempt; try { return await attempt; } catch (error) { if (this.conn === attempt) { this.conn = undefined; } throw error; }';

tester.run('no-cached-rejection', rule, {
  valid: [
    typed(inClass(`async get() { if (this.conn) { return this.conn; } ${SAFE_CATCH} }`)),
    typed(
      inClass(
        'closed = false; start() { if (this.closed) { return; } this.conn = connect(); } stop() { this.closed = true; }',
      ),
    ),
    typed(
      inClass('start(n: number) { const x = n > 1 ? 2 : 3; this.conn = connect(); return x; }'),
    ),
    typed(
      inClass(
        'async get() { if (this.conn) { return this.conn; } const attempt = connect(); this.conn = attempt; try { return await attempt; } finally { if (this.conn === attempt) { this.conn = undefined; } } }',
      ),
    ),
    typed(
      inClass(
        'get() { if (!this.conn) { const attempt = connect(); this.conn = attempt; attempt.catch(() => this.reset(attempt)); } return this.conn; } reset(attempt: Promise<string>) { if (this.conn === attempt) { this.conn = undefined; } }',
      ),
    ),
    typed(
      inClass(
        'get() { if (!this.conn) { const attempt = connect(); this.conn = attempt; attempt.catch(() => { if (this.conn === attempt) { this.conn = undefined; } }); } return this.conn; }',
      ),
    ),
    typed(
      inModule(
        'export async function get() { if (conn) { return conn; } const attempt = connect(); conn = attempt; try { return await attempt; } catch (error) { if (conn === attempt) { conn = undefined; } throw error; } }',
      ),
    ),
    typed(inClass('async get() { this.conn = connect(); return this.conn; }')),
    typed(inClass('async get() { if (this.conn) { return this.conn; } return connect(); }')),
    typed(
      'class Client { private n?: number; get() { if (this.n) { return this.n; } this.n = count(); return this.n; } }',
    ),
    typed(inModule('export function get() { const local = connect(); return local; }')),
    typed(
      'export function get() { let local: Promise<string> | undefined; if (!local) { local = connect(); } return local; }',
    ),
    typed(
      'let conn;\nexport async function get() { if (conn) { return conn; } const attempt = Promise.resolve("x"); conn = attempt; try { return await attempt; } catch (error) { if (conn === attempt) { conn = undefined; } throw error; } }',
      undefined,
      'js',
    ),
  ],
  invalid: [
    typed(inClass('get() { this.conn ??= connect(); return this.conn; }'), 'kept'),
    typed(inClass('get() { return this.conn ??= connect(); }'), 'kept'),
    typed(inClass('get() { return this.conn ?? (this.conn = connect()); }'), 'kept'),
    typed(
      inClass('get() { if (!this.conn) { this.conn = connect(); } return this.conn; }'),
      'kept',
    ),
    typed(
      inClass(
        'get() { if (this.conn) { return this.conn; } this.conn = connect(); return this.conn; }',
      ),
      'kept',
    ),
    typed(inModule('export function get() { conn ||= connect(); return conn; }'), 'kept'),
    typed(
      inModule(
        'export function get() { if (conn === undefined) { conn = connect(); } return conn; }',
      ),
      'kept',
    ),
    typed(inModule('export const get = () => (conn ??= connect());'), 'kept'),
    typed(
      inClass(
        'async get() { if (this.conn) { return this.conn; } this.conn = connect(); try { return await this.conn; } catch (error) { this.conn = undefined; throw error; } }',
      ),
      'stale',
    ),
    typed(
      inClass(
        'get() { if (!this.conn) { this.conn = connect().catch((error) => { this.conn = undefined; throw error; }); } return this.conn; }',
      ),
      'stale',
    ),
    typed(
      inModule(
        'export function get() { conn ??= connect(); conn.catch(() => { conn = undefined; }); return conn; }',
      ),
      'stale',
    ),
    typed(
      'let conn;\nexport function get() { conn ??= Promise.resolve("x"); return conn; }',
      'kept',
      'js',
    ),
  ],
});
