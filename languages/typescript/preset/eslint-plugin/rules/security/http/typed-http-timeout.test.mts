import { typedCaseProject } from '../../../test-support/projects/typed-ts-project.mts';
import { rule } from './require-http-timeout.mjs';
import { withoutFixes } from '../../../../eslint-config/rule-hints.mjs';

type Errors = { messageId: string; data: Record<string, string> }[];

const { tester, typed } = typedCaseProject<Errors>({
  prefix: 'nitpicker-http-typed-',
  lib: ['ES2022', 'DOM'],
  header: 'import https from "node:https";\nimport type { RequestOptions } from "node:https";\n',
});

tester.run('require-http-timeout with types', withoutFixes(rule), {
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
