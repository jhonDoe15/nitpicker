import { afterAll } from 'vitest';
import { rule } from '../../../rules/concurrency/unbounded-fan-out.mts';
import { typedProject } from '../typed-project.mts';

const IMPORT = "import pMap from 'p-map';\n";
const LIMIT = '{ concurrency: 8 }';
const DECLARE = 'declare const ids: string[];\n';
const ALL = 'Promise.all(ids.map((id) => fetch(id)))';
const PMAP = `pMap(ids, (id) => fetch(id), ${LIMIT})`;
const project = typedProject('p-map-receiver-', {
  type: 'module',
  dependencies: { 'p-map': '^7.0.0' },
});
afterAll(project.cleanup);
const { typed } = project;

function rewritten(code: string, output: string) {
  return typed(code, [
    {
      messageId: 'unbounded',
      suggestions: [{ messageId: 'usePMap', output: `${IMPORT}${output}` }],
    },
  ] as never);
}

function kept(code: string) {
  return typed(code, [{ messageId: 'unbounded' }] as never);
}

function stable(body: string, output: string) {
  return rewritten(
    `${DECLARE}export async function f() { ${body.replace('ALL', ALL)} }`,
    `${DECLARE}export async function f() { ${output.replace('PMAP', PMAP)} }`,
  );
}

function unstable(body: string) {
  return kept(`${DECLARE}export async function f() { ${body.replace('ALL', ALL)} }`);
}

project.tester.run('pMap needs a receiver that nothing changes while it runs', rule, {
  valid: [],
  invalid: [
    stable('return ALL;', 'return PMAP;'),
    stable(
      'const n = ids.length; return [n, await ALL];',
      'const n = ids.length; return [n, await PMAP];',
    ),
    stable(
      'for (const id of ids) { console.log(id); } return ALL;',
      'for (const id of ids) { console.log(id); } return PMAP;',
    ),
    stable(
      'const copy = [...ids]; return [copy, await ALL];',
      'const copy = [...ids]; return [copy, await PMAP];',
    ),
    stable('return [ids[0], await ALL];', 'return [ids[0], await PMAP];'),
    rewritten(
      'export async function f(queue: string[]) { return Promise.all(queue.slice().map((id) => fetch(id))); }',
      'export async function f(queue: string[]) { return pMap(queue.slice(), (id) => fetch(id), { concurrency: 8 }); }',
    ),
    rewritten(
      'declare function load(): string[];\nexport async function f() { return Promise.all(load().map((id) => fetch(id))); }',
      'declare function load(): string[];\nexport async function f() { return pMap(load(), (id) => fetch(id), { concurrency: 8 }); }',
    ),
    rewritten(
      `${DECLARE}export async function f() { return Promise.all([...ids, 'x'].map((id) => fetch(id))); }`,
      `${DECLARE}export async function f() { return pMap([...ids, 'x'], (id) => fetch(id), { concurrency: 8 }); }`,
    ),
    rewritten(
      'declare const raw: string[];\nexport async function f() { const ids = raw.filter(Boolean); return Promise.all(ids.map((id) => fetch(id))); }',
      'declare const raw: string[];\nexport async function f() { const ids = raw.filter(Boolean); return pMap(ids, (id) => fetch(id), { concurrency: 8 }); }',
    ),
    kept(
      'export async function f(queue: string[]) { return Promise.all(queue.map((id) => fetch(id))); }',
    ),
    kept(
      'declare let ids: string[];\nexport async function f() { return Promise.all(ids.map((id) => fetch(id))); }',
    ),
    kept(
      'declare var ids: string[];\nexport async function f() { return Promise.all(ids.map((id) => fetch(id))); }',
    ),
    kept(
      'export class Q { queue: string[] = []; async run() { return Promise.all(this.queue.map((id) => fetch(id))); } }',
    ),
    kept(
      'declare const state: { queue: string[] };\nexport async function f() { return Promise.all(state.queue.map((id) => fetch(id))); }',
    ),
    unstable("const run = ALL; ids.push('x'); return run;"),
    unstable("ids.push('x'); return ALL;"),
    unstable('const first = ALL; ids.pop(); return first;'),
    unstable('const first = ALL; ids.shift(); return first;'),
    unstable("const first = ALL; ids.unshift('x'); return first;"),
    unstable("const first = ALL; ids.splice(0, 1, 'x'); return first;"),
    unstable('const first = ALL; ids.sort(); return first;'),
    unstable('const first = ALL; ids.reverse(); return first;'),
    unstable("const first = ALL; ids.fill('x'); return first;"),
    unstable('const first = ALL; ids.copyWithin(0, 1); return first;'),
    unstable("const first = ALL; ids['push']('x'); return first;"),
    unstable('const first = ALL; ids.pop?.(); return first;'),
    unstable('const first = ALL; ids.length = 0; return first;'),
    unstable("const first = ALL; ids[0] = 'x'; return first;"),
    unstable('const first = ALL; ids.length--; return first;'),
    unstable('const first = ALL; delete ids[0]; return first;'),
    unstable("const first = ALL; [ids[0]] = ['x']; return first;"),
    unstable("const first = ALL; ({ a: ids[0] } = { a: 'x' }); return first;"),
    unstable("const first = ALL; for (ids[0] of ['x']) { break; } return first;"),
    unstable('register(ids); return ALL;'),
    unstable('const alias = ids; return [alias, await ALL];'),
    unstable('return [ids, await ALL];'),
    unstable('return Promise.all(ids.map((id) => fetch(id + ids.length)));'),
    unstable('return Promise.all(ids.map((id) => { ids.pop(); return fetch(id); }));'),
  ],
});
