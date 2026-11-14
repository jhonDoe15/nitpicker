import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-raw-http-value.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/web/negotiate.ts';

const valueCase = (header) => ({ messageId: 'valueCase', data: { header } });
const handSplit = (header) => ({ messageId: 'handSplit', data: { header } });

tester.run('no-raw-http-value', rule, {
  valid: [
    "const type = request.headers.get('content-type')?.toLowerCase(); if (type === 'application/json') { run(); }",
    "if (headers.get('content-type')?.toLowerCase().startsWith('application/json')) { run(); }",
    "const type = headers.get('Content-Type'); if (/^application\\/json/i.test(type)) { run(); }",
    "const proto = (req.headers['x-forwarded-proto'] ?? '').toLowerCase(); if (proto === 'https') { run(); }",
    "const type = parse(req.headers['content-type']); if (type.type === 'application/json') { run(); }",
    "if (headers.get('content-length') === '0') { run(); }",
    "if (headers.get('x-request-id') === 'abc') { run(); }",
    "if (headers.get('etag') === 'W/\"abc\"') { run(); }",
    "if (request.method === 'GET') { run(); }",
    "if (url.protocol === 'https:') { run(); }",
    "const type = headers.get('content-type'); if (type === null) { run(); }",
    "const type = headers.get('content-type'); if (type === other) { run(); }",
    "const [first] = headers.get('x-forwarded-for').split(',');",
    "const parts = req.headers['content-type'].split('/');",
    "const type = headers.get('content-type'); let copy = type; copy = 'x'; if (copy === 'text/html') { run(); }",
    "const value = headers.get('Content-Type');",
    "const type = req.headers['content-type']; const normal = type.toLowerCase(); if (normal === 'text/html') { run(); }",
    'const ext = extname(file).toLowerCase(); const mime = MIME_TYPES[ext];',
    'const ext = path.extname(file); const size = SIZES[ext];',
    'const mime = MIME_TYPES[name];',
    "if (name.toLowerCase().startsWith('__host-')) { run(); }",
    "if (name.startsWith('session-')) { run(); }",
    'if (/^__host-/i.test(name)) { run(); }',
    "const own = { 'Content-Type': 'x' }; use(own['Content-Type']);",
    "const out = res.headers['Content-Type'];",
    "const lower = req.headers['content-type'];",
    "headers.set('Content-Type', 'text/plain');",
    "function f(value: string) { return value === 'application/json'; }",
    "const mode = headers.get(name); if (mode === 'Fast') { run(); }",
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      code: "if (request.headers.get('content-type') === 'application/json') { run(); }",
      errors: [valueCase('content-type')],
    },
    {
      code: "if (c.req.header('Accept') !== 'text/html') { run(); }",
      errors: [valueCase('accept')],
    },
    {
      code: "const type = req.headers['content-type']; if (type.startsWith('multipart/')) { run(); }",
      errors: [valueCase('content-type')],
    },
    {
      code: "const proto = req.headers['x-forwarded-proto'] ?? ''; if (proto === 'https') { run(); }",
      errors: [valueCase('x-forwarded-proto')],
    },
    {
      code: "const encoding = req.get('Accept-Encoding'); if (encoding?.includes('gzip')) { run(); }",
      errors: [valueCase('accept-encoding')],
    },
    {
      code: "switch (headers.get('content-type')) { case 'text/plain': run(); }",
      errors: [valueCase('content-type')],
    },
    {
      code: "const type = headers.get('content-type'); if (TEXT_TYPES.has(type)) { run(); }",
      errors: [valueCase('content-type')],
    },
    {
      code: "const type = headers.get('content-type'); if (['a/b', 'c/d'].includes(type)) { run(); }",
      errors: [valueCase('content-type')],
    },
    {
      code: "const type = headers.get('content-type'); const handler = HANDLERS[type];",
      errors: [valueCase('content-type')],
    },
    {
      code: "const type = String(req.headers.accept).trim(); if (type === 'text/html') { run(); }",
      errors: [valueCase('accept')],
    },
    {
      code: "const type = headers.get('content-type'); if (/json/.test(type)) { run(); }",
      errors: [valueCase('content-type')],
    },
    {
      code: "const auth = req.headers.authorization; if (auth?.startsWith('Bearer ')) { run(); }",
      errors: [valueCase('authorization')],
    },
    {
      code: "const accept = headers.get('accept'); const types = accept.split(',');",
      errors: [handSplit('accept')],
    },
    {
      code: "const [type, charset] = request.headers['content-type'].split(';');",
      errors: [handSplit('content-type')],
    },
    {
      code: 'const cookies = req.headers.cookie.split(/;\\s*/);',
      errors: [handSplit('cookie')],
    },
    {
      code: "const match = /charset=([^;]+)/i.exec(headers.get('content-type'));",
      errors: [handSplit('content-type')],
    },
    {
      code: "const tags = (headers.get('if-none-match') ?? '').split(', ');",
      errors: [handSplit('if-none-match')],
    },
    {
      code: "const type = req.headers['Content-Type'];",
      errors: [{ messageId: 'nameCase', data: { name: 'Content-Type', lower: 'content-type' } }],
    },
    {
      code: "const { headers } = req; const type = req.headers['Content-Type'];",
      errors: [{ messageId: 'nameCase' }],
    },
    {
      code: "const headers = request.headers; if ('Accept' in headers) { run(); }",
      errors: [{ messageId: 'nameCase' }],
    },
    {
      code: "if (name.startsWith('__Host-')) { run(); }",
      errors: [{ messageId: 'cookiePrefix' }],
    },
    {
      code: 'if (/^__Secure-/.test(name)) { run(); }',
      errors: [{ messageId: 'cookiePrefix' }],
    },
    {
      code: 'const ext = path.extname(file); const type = MIME_TYPES[ext];',
      errors: [{ messageId: 'extensionCase' }],
    },
    {
      code: "const ext = file.split('.').pop(); const type = mimeTypes.get(ext);",
      errors: [{ messageId: 'extensionCase' }],
    },
    {
      code: "const ext = file.slice(file.lastIndexOf('.') + 1); const type = MIME[ext];",
      errors: [{ messageId: 'extensionCase' }],
    },
  ].map((item) => ({ filename, ...item })),
});

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-http-values-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2022', 'DOM'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function typed(code, errors) {
  const file = path.join(root, `src/case-${randomUUID()}.ts`);
  writeFileSync(file, code);
  return errors === undefined ? { filename: file, code } : { filename: file, code, errors };
}

typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root }).run(
  'no-raw-http-value with types',
  rule,
  {
    valid: [
      typed("export const f = (u: URL) => u.protocol === 'https:';"),
      typed(
        "export const f = (h: Headers) => h.get('content-type')?.toLowerCase() === 'text/html';",
      ),
      typed("export const f = (m: Map<string, string>) => m.get('content-type') === 'text/html';"),
    ],
    invalid: [
      typed("export const f = (h: Headers) => h.get('content-type') === 'text/html';", [
        valueCase('content-type'),
      ]),
      typed("export const f = (x: Request) => x.headers.get('accept')?.startsWith('text/');", [
        valueCase('accept'),
      ]),
      typed("export const f = (u: URL) => u.protocol === 'HTTPS:';", [
        { messageId: 'urlCase', data: { part: 'protocol' } },
      ]),
      typed("export const f = (u: URL) => u.hostname === 'Example.com';", [
        { messageId: 'urlCase', data: { part: 'hostname' } },
      ]),
    ],
  },
);
