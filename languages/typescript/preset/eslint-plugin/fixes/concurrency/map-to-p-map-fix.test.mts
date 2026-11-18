import { afterAll } from 'vitest';
import { rule } from '../../rules/concurrency/unbounded-fan-out.mts';
import { typedProject } from './typed-project.mts';

const ESM = { type: 'module', dependencies: { 'p-map': '^7.0.0' } };
const IMPORT = "import pMap from 'p-map';\n";
const LIMIT = '{ concurrency: 8 }';
const project = typedProject('p-map-rewrite-', ESM);
afterAll(project.cleanup);
const { typed } = project;

function rewritten(code: string, output: string) {
  return typed(code, [
    { messageId: 'unbounded', suggestions: [{ messageId: 'usePMap', output }] },
  ] as never);
}

function kept(code: string) {
  return typed(code, [{ messageId: 'unbounded' }] as never);
}

project.tester.run('Promise.all over map becomes pMap', rule, {
  valid: [],
  invalid: [
    rewritten(
      'export async function a(ids: string[]) { return await Promise.all(ids.map((id) => fetch(`/x/${id}`))); }',
      `${IMPORT}export async function a(ids: string[]) { return await pMap(ids, (id) => fetch(\`/x/\${id}\`), ${LIMIT}); }`,
    ),
    rewritten(
      `${IMPORT}export async function a(ids: string[]) { return Promise.all(ids.map((id) => fetch(id))); }`,
      `${IMPORT}export async function a(ids: string[]) { return pMap(ids, (id) => fetch(id), ${LIMIT}); }`,
    ),
    rewritten(
      "import pm from 'p-map';\nexport async function a(ids: string[]) { return Promise.all(ids.map((id) => fetch(id))); }",
      `import pm from 'p-map';\nexport async function a(ids: string[]) { return pm(ids, (id) => fetch(id), ${LIMIT}); }`,
    ),
    rewritten(
      'export async function b(ts: { id: string }[]) { return await Promise.all(ts.map(async (t) => { const r = await fetch(t.id); return r.json(); })); }',
      `${IMPORT}export async function b(ts: { id: string }[]) { return await pMap(ts, async (t) => { const r = await fetch(t.id); return r.json(); }, ${LIMIT}); }`,
    ),
    rewritten(
      'const download = (u: string) => fetch(u);\nexport async function c(urls: string[]) { return Promise.all(urls.map(download)); }',
      `${IMPORT}const download = (u: string) => fetch(u);\nexport async function c(urls: string[]) { return pMap(urls, download, ${LIMIT}); }`,
    ),
    rewritten(
      'async function download(u: string) { return fetch(u); }\nexport async function c(urls: string[]) { return Promise.all(urls.map(download)); }',
      `${IMPORT}async function download(u: string) { return fetch(u); }\nexport async function c(urls: string[]) { return pMap(urls, download, ${LIMIT}); }`,
    ),
    rewritten(
      'export async function e(o: Record<string, string>) { return Promise.all(Object.entries(o).map(([k, v]) => fetch(k + v))); }',
      `${IMPORT}export async function e(o: Record<string, string>) { return pMap(Object.entries(o), ([k, v]) => fetch(k + v), ${LIMIT}); }`,
    ),
    rewritten(
      'export class C { urls: string[] = []; async go() { return Promise.all(this.urls.map((u) => fetch(u))); } }',
      `${IMPORT}export class C { urls: string[] = []; async go() { return pMap(this.urls, (u) => fetch(u), ${LIMIT}); } }`,
    ),
    rewritten(
      'export async function f(ids: string[]) { const rs = await Promise.all(ids.map((id) => fetch(id))); return rs.length; }',
      `${IMPORT}export async function f(ids: string[]) { const rs = await pMap(ids, (id) => fetch(id), ${LIMIT}); return rs.length; }`,
    ),
    rewritten(
      'declare const ids: string[];\nexport const all = await Promise.all(ids.map((id) => fetch(id)));',
      `${IMPORT}declare const ids: string[];\nexport const all = await pMap(ids, (id) => fetch(id), ${LIMIT});`,
    ),
    rewritten(
      'export async function g(ids: (string | undefined)[]) { return Promise.all(ids.filter((id) => id !== undefined).map((id) => fetch(String(id)))); }',
      `${IMPORT}export async function g(ids: (string | undefined)[]) { return pMap(ids.filter((id) => id !== undefined), (id) => fetch(String(id)), ${LIMIT}); }`,
    ),
    rewritten(
      "import { join } from 'node:path';\nexport async function h(ids: string[]) { return Promise.all(ids.map((id) => fetch(join('/', id)))); }",
      `import { join } from 'node:path';\nimport pMap from 'p-map';\nexport async function h(ids: string[]) { return pMap(ids, (id) => fetch(join('/', id)), ${LIMIT}); }`,
    ),
    rewritten(
      'export async function i(ids: readonly [string, string]) { return Promise.all(ids.map((id) => fetch(id))); }',
      `${IMPORT}export async function i(ids: readonly [string, string]) { return pMap(ids, (id) => fetch(id), ${LIMIT}); }`,
    ),
    rewritten(
      'export async function j(ids: string[]) { return Promise.all(ids.map(function (id) { return fetch(id); })); }',
      `${IMPORT}export async function j(ids: string[]) { return pMap(ids, function (id) { return fetch(id); }, ${LIMIT}); }`,
    ),
    kept(
      'export async function k(ids: string[]) { return Promise.all(ids.map((id, index) => fetch(`${id}${index}`))); }',
    ),
  ],
});
