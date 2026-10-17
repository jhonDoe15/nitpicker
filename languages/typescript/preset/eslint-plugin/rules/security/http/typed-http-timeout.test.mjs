import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './require-http-timeout.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-http-typed-')));
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

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });
const header =
  'import https from "node:https";\nimport type { RequestOptions } from "node:https";\n';
let counter = 0;

function typed(body, errors) {
  counter += 1;
  const code = `${header}${body}`;
  const file = path.join(root, `src/case-${String(counter)}.ts`);
  writeFileSync(file, code);
  return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
}

tester.run('require-http-timeout with types', rule, {
  valid: [
    typed(
      'export const get = (options: RequestOptions) => https.get(options, (res) => res.resume());',
    ),
    typed(
      'export const get = (url: string) => https.get(url, { timeout: 5000 }, (res) => res.resume());',
    ),
    typed('export const forward = (request: Request) => fetch(request);'),
    typed(
      'type FetchEvent = { request: Request; respondWith(r: Promise<Response>): void };\nexport const onFetch = (event: FetchEvent) => { event.respondWith(fetch(event.request)); };',
    ),
    typed('export const toBlob = (dataUrl: string) => fetch(dataUrl).then((r) => r.blob());'),
    typed("export const wasm = () => fetch(new URL('./lib.wasm', import.meta.url));"),
    typed('export const get = (url: string, signal: AbortSignal) => fetch(url, { signal });'),
  ],
  invalid: [
    typed('export const get = (url: string) => https.get(url, (res) => res.resume());', [
      { messageId: 'noTimeout', data: { call: 'http.get()' } },
    ]),
    typed('export const get = (url: URL) => https.get(url, (res) => res.resume());', [
      { messageId: 'noTimeout', data: { call: 'http.get()' } },
    ]),
    typed(
      'export const get = (url: string, receive: (res: unknown) => void) => https.get(url, receive);',
      [{ messageId: 'noTimeout', data: { call: 'http.get()' } }],
    ),
    typed('export const send = (request: Request) => fetch(request, { method: "POST" });', [
      { messageId: 'noTimeout', data: { call: 'fetch()' } },
    ]),
  ],
});
