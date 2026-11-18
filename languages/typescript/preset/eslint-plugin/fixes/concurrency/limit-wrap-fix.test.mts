import { afterAll } from 'vitest';
import { rule } from '../../rules/concurrency/unbounded-fan-out.mts';
import { typedProject } from './typed-project.mts';

const ESM = { type: 'module', dependencies: { 'p-limit': '^6.0.0' } };
const IMPORT = "import pLimit from 'p-limit';\n";
const project = typedProject('p-limit-wrap-', ESM);
afterAll(project.cleanup);
const { typed } = project;

function wrapped(code: string, output: string) {
  return typed(code, [
    { messageId: 'unbounded', suggestions: [{ messageId: 'useLimit', output }] },
  ]);
}

project.tester.run('Promise.allSettled gets a per-call limiter', rule, {
  valid: [
    typed(
      `${IMPORT}export async function d(us: string[]) { const limit = pLimit(8); return Promise.allSettled(us.map((u) => limit(() => fetch(u)))); }`,
    ),
    typed(
      `${IMPORT}export async function d(us: string[]) { const limit = pLimit(8); return Promise.allSettled(us.map(async (u) => limit(async () => { const r = await fetch(u); return r.json(); }))); }`,
    ),
  ],
  invalid: [
    wrapped(
      'export async function d(us: string[]) { return Promise.allSettled(us.map((u) => fetch(u))); }',
      `${IMPORT}export async function d(us: string[]) { const limit = pLimit(8); return Promise.allSettled(us.map((u) => limit(() => fetch(u)))); }`,
    ),
    wrapped(
      'export async function d(us: string[]) {\n  const results = await Promise.allSettled(us.map((u) => fetch(u)));\n  return results.length;\n}',
      `${IMPORT}export async function d(us: string[]) {\n  const limit = pLimit(8);\n  const results = await Promise.allSettled(us.map((u) => limit(() => fetch(u))));\n  return results.length;\n}`,
    ),
    wrapped(
      'export async function d(us: string[]) {\n\tawait Promise.allSettled(us.map((u) => fetch(u)));\n}',
      `${IMPORT}export async function d(us: string[]) {\n\tconst limit = pLimit(8);\n\tawait Promise.allSettled(us.map((u) => limit(() => fetch(u))));\n}`,
    ),
    wrapped(
      'export async function d(us: string[]) { return Promise.allSettled(us.map(async (u) => { const r = await fetch(u); return r.json(); })); }',
      `${IMPORT}export async function d(us: string[]) { const limit = pLimit(8); return Promise.allSettled(us.map(async (u) => limit(async () => { const r = await fetch(u); return r.json(); }))); }`,
    ),
    wrapped(
      'export async function d(us: string[]) { return Promise.allSettled(us.map((u) => { return fetch(u); })); }',
      `${IMPORT}export async function d(us: string[]) { const limit = pLimit(8); return Promise.allSettled(us.map((u) => limit(() => { return fetch(u); }))); }`,
    ),
    wrapped(
      'export async function d(us: string[]) { return Promise.allSettled(us.map((u) => ({ url: u, r: fetch(u) }))); }',
      `${IMPORT}export async function d(us: string[]) { const limit = pLimit(8); return Promise.allSettled(us.map((u) => limit(() => ({ url: u, r: fetch(u) })))); }`,
    ),
    wrapped(
      'export async function d(us: string[]) { return Promise.allSettled(us.map((u, i) => fetch(u + i))); }',
      `${IMPORT}export async function d(us: string[]) { const limit = pLimit(8); return Promise.allSettled(us.map((u, i) => limit(() => fetch(u + i)))); }`,
    ),
    wrapped(
      'export async function d(us: { id: string }[]) { return Promise.allSettled(us.map(({ id }) => fetch(id))); }',
      `${IMPORT}export async function d(us: { id: string }[]) { const limit = pLimit(8); return Promise.allSettled(us.map(({ id }) => limit(() => fetch(id)))); }`,
    ),
    wrapped(
      `${IMPORT}export async function d(us: string[]) { return Promise.allSettled(us.map((u) => fetch(u))); }`,
      `${IMPORT}export async function d(us: string[]) { const limit = pLimit(8); return Promise.allSettled(us.map((u) => limit(() => fetch(u)))); }`,
    ),
    wrapped(
      "import limiter from 'p-limit';\nexport async function d(us: string[]) { return Promise.allSettled(us.map((u) => fetch(u))); }",
      "import limiter from 'p-limit';\nexport async function d(us: string[]) { const limit = limiter(8); return Promise.allSettled(us.map((u) => limit(() => fetch(u)))); }",
    ),
    wrapped(
      'export async function d(us: string[], limit: number) { return Promise.allSettled(us.map((u) => fetch(u + limit))); }',
      `${IMPORT}export async function d(us: string[], limit: number) { const limit2 = pLimit(8); return Promise.allSettled(us.map((u) => limit2(() => fetch(u + limit)))); }`,
    ),
    wrapped(
      'export async function d(groups: string[][]) {\n  for (const group of groups) {\n    await Promise.allSettled(group.map((u) => fetch(u)));\n  }\n}',
      `${IMPORT}export async function d(groups: string[][]) {\n  for (const group of groups) {\n    const limit = pLimit(8);\n    await Promise.allSettled(group.map((u) => limit(() => fetch(u))));\n  }\n}`,
    ),
    wrapped(
      'export async function d(us: string[], on: boolean) {\n  if (on) await Promise.allSettled(us.map((u) => fetch(u)));\n}',
      `${IMPORT}export async function d(us: string[], on: boolean) {\n  const limit = pLimit(8);\n  if (on) await Promise.allSettled(us.map((u) => limit(() => fetch(u))));\n}`,
    ),
    wrapped(
      'export class C { urls: string[] = []; async go() { try { return await Promise.allSettled(this.urls.map((u) => fetch(u))); } catch { return []; } } }',
      `${IMPORT}export class C { urls: string[] = []; async go() { try { const limit = pLimit(8); return await Promise.allSettled(this.urls.map((u) => limit(() => fetch(u)))); } catch { return []; } } }`,
    ),
  ],
});
