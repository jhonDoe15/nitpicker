import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { typedCases, type CaseError } from '../../test-support/typed-cases.mts';
import { rule } from './no-raw-http-value.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/web/negotiate.ts';

function valueCase(header: string): CaseError {
  return { messageId: 'valueCase', data: { header } };
}
function handSplit(header: string): CaseError {
  return { messageId: 'handSplit', data: { header } };
}

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
  invalid: (
    [
      [
        "if (request.headers.get('content-type') === 'application/json') { run(); }",
        valueCase('content-type'),
      ],
      ["if (c.req.header('Accept') !== 'text/html') { run(); }", valueCase('accept')],
      [
        "const type = req.headers['content-type']; if (type.startsWith('multipart/')) { run(); }",
        valueCase('content-type'),
      ],
      [
        "const proto = req.headers['x-forwarded-proto'] ?? ''; if (proto === 'https') { run(); }",
        valueCase('x-forwarded-proto'),
      ],
      [
        "const encoding = req.get('Accept-Encoding'); if (encoding?.includes('gzip')) { run(); }",
        valueCase('accept-encoding'),
      ],
      [
        "switch (headers.get('content-type')) { case 'text/plain': run(); }",
        valueCase('content-type'),
      ],
      [
        "const type = headers.get('content-type'); if (TEXT_TYPES.has(type)) { run(); }",
        valueCase('content-type'),
      ],
      [
        "const type = headers.get('content-type'); if (['a/b', 'c/d'].includes(type)) { run(); }",
        valueCase('content-type'),
      ],
      [
        "const type = headers.get('content-type'); const handler = HANDLERS[type];",
        valueCase('content-type'),
      ],
      [
        "const type = String(req.headers.accept).trim(); if (type === 'text/html') { run(); }",
        valueCase('accept'),
      ],
      [
        "const type = headers.get('content-type'); if (/json/.test(type)) { run(); }",
        valueCase('content-type'),
      ],
      [
        "const auth = req.headers.authorization; if (auth?.startsWith('Bearer ')) { run(); }",
        valueCase('authorization'),
      ],
      [
        "const accept = headers.get('accept'); const types = accept.split(',');",
        handSplit('accept'),
      ],
      [
        "const [type, charset] = request.headers['content-type'].split(';');",
        handSplit('content-type'),
      ],
      ['const cookies = req.headers.cookie.split(/;\\s*/);', handSplit('cookie')],
      [
        "const match = /charset=([^;]+)/i.exec(headers.get('content-type'));",
        handSplit('content-type'),
      ],
      [
        "const tags = (headers.get('if-none-match') ?? '').split(', ');",
        handSplit('if-none-match'),
      ],
      [
        "const type = req.headers['Content-Type'];",
        { messageId: 'nameCase', data: { name: 'Content-Type', lower: 'content-type' } },
      ],
      [
        "const { headers } = req; const type = req.headers['Content-Type'];",
        { messageId: 'nameCase' },
      ],
      [
        "const headers = request.headers; if ('Accept' in headers) { run(); }",
        { messageId: 'nameCase' },
      ],
      ["if (name.startsWith('__Host-')) { run(); }", { messageId: 'cookiePrefix' }],
      ['if (/^__Secure-/.test(name)) { run(); }', { messageId: 'cookiePrefix' }],
      [
        'const ext = path.extname(file); const type = MIME_TYPES[ext];',
        { messageId: 'extensionCase' },
      ],
      [
        "const ext = file.split('.').pop(); const type = mimeTypes.get(ext);",
        { messageId: 'extensionCase' },
      ],
      [
        "const ext = file.slice(file.lastIndexOf('.') + 1); const type = MIME[ext];",
        { messageId: 'extensionCase' },
      ],
    ] satisfies [string, CaseError][]
  ).map(([code, error]) => ({ filename, code, errors: [error] })),
});

const {
  tester: typedTester,
  cleanup,
  typed,
} = typedCases('nitpicker-http-values-', {
  module: 'esnext',
  moduleResolution: 'bundler',
  lib: ['ES2022', 'DOM'],
});
afterAll(cleanup);

typedTester.run('no-raw-http-value with types', rule, {
  valid: [
    typed("export const f = (u: URL) => u.protocol === 'https:';"),
    typed("export const f = (h: Headers) => h.get('content-type')?.toLowerCase() === 'text/html';"),
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
});
