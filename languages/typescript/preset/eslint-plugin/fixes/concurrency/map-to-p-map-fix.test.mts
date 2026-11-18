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
  valid: [
    typed(
      `${IMPORT}declare const ids: string[];\nexport async function a() { return await pMap(ids, (id) => fetch(id), ${LIMIT}); }`,
    ),
  ],
  invalid: [
    rewritten(
      'declare const ids: string[];\nexport async function a() { return await Promise.all(ids.map((id) => fetch(`/x/${id}`))); }',
      `${IMPORT}declare const ids: string[];\nexport async function a() { return await pMap(ids, (id) => fetch(\`/x/\${id}\`), ${LIMIT}); }`,
    ),
    rewritten(
      `${IMPORT}declare const ids: string[];\nexport async function a() { return Promise.all(ids.map((id) => fetch(id))); }`,
      `${IMPORT}declare const ids: string[];\nexport async function a() { return pMap(ids, (id) => fetch(id), ${LIMIT}); }`,
    ),
    rewritten(
      "import pm from 'p-map';\ndeclare const ids: string[];\nexport async function a() { return Promise.all(ids.map((id) => fetch(id))); }",
      `import pm from 'p-map';\ndeclare const ids: string[];\nexport async function a() { return pm(ids, (id) => fetch(id), ${LIMIT}); }`,
    ),
    rewritten(
      'declare const ts: { id: string }[];\nexport async function b() { return await Promise.all(ts.map(async (t) => { const r = await fetch(t.id); return r.json(); })); }',
      `${IMPORT}declare const ts: { id: string }[];\nexport async function b() { return await pMap(ts, async (t) => { const r = await fetch(t.id); return r.json(); }, ${LIMIT}); }`,
    ),
    rewritten(
      'const download = (u: string) => fetch(u);\ndeclare const urls: string[];\nexport async function c() { return Promise.all(urls.map(download)); }',
      `${IMPORT}const download = (u: string) => fetch(u);\ndeclare const urls: string[];\nexport async function c() { return pMap(urls, download, ${LIMIT}); }`,
    ),
    rewritten(
      'async function download(u: string) { return fetch(u); }\ndeclare const urls: string[];\nexport async function c() { return Promise.all(urls.map(download)); }',
      `${IMPORT}async function download(u: string) { return fetch(u); }\ndeclare const urls: string[];\nexport async function c() { return pMap(urls, download, ${LIMIT}); }`,
    ),
    rewritten(
      'export async function e(o: Record<string, string>) { return Promise.all(Object.entries(o).map(([k, v]) => fetch(k + v))); }',
      `${IMPORT}export async function e(o: Record<string, string>) { return pMap(Object.entries(o), ([k, v]) => fetch(k + v), ${LIMIT}); }`,
    ),
    kept(
      'export class C { urls: string[] = []; async go() { return Promise.all(this.urls.map((u) => fetch(u))); } }',
    ),
    rewritten(
      'declare const ids: string[];\nexport async function f() { const rs = await Promise.all(ids.map((id) => fetch(id))); return rs.length; }',
      `${IMPORT}declare const ids: string[];\nexport async function f() { const rs = await pMap(ids, (id) => fetch(id), ${LIMIT}); return rs.length; }`,
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
      "import { join } from 'node:path';\ndeclare const ids: string[];\nexport async function h() { return Promise.all(ids.map((id) => fetch(join('/', id)))); }",
      `import { join } from 'node:path';\nimport pMap from 'p-map';\ndeclare const ids: string[];\nexport async function h() { return pMap(ids, (id) => fetch(join('/', id)), ${LIMIT}); }`,
    ),
    rewritten(
      'declare const ids: readonly [string, string];\nexport async function i() { return Promise.all(ids.map((id) => fetch(id))); }',
      `${IMPORT}declare const ids: readonly [string, string];\nexport async function i() { return pMap(ids, (id) => fetch(id), ${LIMIT}); }`,
    ),
    rewritten(
      'declare const ids: string[];\nexport async function j() { return Promise.all(ids.map(function (id) { return fetch(id); })); }',
      `${IMPORT}declare const ids: string[];\nexport async function j() { return pMap(ids, function (id) { return fetch(id); }, ${LIMIT}); }`,
    ),
    kept(
      'declare const ids: string[];\nexport async function k() { return Promise.all(ids.map((id, index) => fetch(`${id}${index}`))); }',
    ),
  ],
});
