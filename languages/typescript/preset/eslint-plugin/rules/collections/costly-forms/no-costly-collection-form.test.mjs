import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './no-costly-collection-form.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/routing/adapters/routes.ts';

function error(messageId, data) {
  return { messageId, data };
}

const SET = (name, method) => error('arrayAsSet', { name, method });
const MAP = (name, method, key) => error('lookupInLoop', { name, method, key });
const SORT = (method) => error('sortForExtreme', { method });

tester.run('no-costly-collection-form', rule, {
  valid: [
    'const seen = new Set(); for (const x of xs) { if (!seen.has(x)) seen.add(x); }',
    'const parts = []; if (!parts.includes(a)) parts.push(a);',
    'function f(xs, y) { const seen = []; for (const x of xs) { seen.push(x); } return seen.includes(y); }',
    'const order = []; for (const x of xs) { if (!order.includes(x)) order.push(x); } order.splice(0, 1);',
    'const order = []; for (const x of xs) { if (order.indexOf(x) === -1) order.push(x); } use(order[0]);',
    'const order = []; for (const x of xs) { const at = order.indexOf(x); order.push(at); }',
    'const found = []; for (const x of xs) { if (found.some((f) => f.id === x)) found.push(x); }',
    'for (const x of xs) { const local = []; if (!local.includes(x)) local.push(x); }',
    'const rows = load(); rows.find((row) => row.id === id);',
    'const rows = load(); for (const e of events) { rows.find((row) => row.kind === "fixed"); }',
    'const rows = load(); for (const e of events) { rows.push(e); rows.find((row) => row.id === e.id); }',
    'let rows = load(); for (const e of events) { rows.find((row) => row.id === e.id); rows = next(); }',
    'for (const e of events) { const rows = load(e); rows.find((row) => row.id === e.id); }',
    'const rows = load(); for (const e of events) { rows.find((row) => row.id === row.parent); }',
    'const rows = load(); for (const e of events) { rows.find((row) => row.id > e.id); }',
    'const rows = load(); for (const e of events) { rows.find((row, index) => matches(row, e, index)); }',
    'class Bus { handlers = []; add(h) { this.handlers.push(h); } run(e) { e.forEach((m) => this.handlers.find((h) => h.message === m)); } }',
    'const best = scores.reduce((top, x) => (x > top ? x : top));',
    'const sorted = rows.toSorted(byDate); return [sorted[0], sorted.at(-1)];',
    'rows.sort(byDate); const first = rows[0];',
    'const first = rows.sort(byDate)[0]; render(rows);',
    'const first = this.rows.sort(byDate)[0];',
    'const second = rows.toSorted(byDate)[1];',
    'const [first, second] = rows.toSorted(byDate);',
    'const top = rows.toSorted(byDate).slice(0, 3);',
    'const seen = []; function add(x) { if (!seen.includes(x)) seen.push(x); }',
    'const seen = []; const add = (x) => { const inner = () => !seen.includes(x) && seen.push(x); inner(); };',
    'export const seen = []; for (const x of xs) { if (!seen.includes(x)) seen.push(x); }',
    'rows.toSorted(byDate)[0] = first;',
    'delete rows.toSorted(byDate)[0];',
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      code: 'const visited = []; function walk(node) { if (visited.includes(node)) return; visited.push(node); node.children.forEach(walk); }',
      errors: [SET('visited', 'includes')],
    },
    {
      code: 'const ids = []; for (const row of rows) { if (ids.indexOf(row.id) === -1) { ids.push(row.id); } }',
      errors: [SET('ids', 'indexOf')],
    },
    {
      code: 'let ids: string[] = []; rows.forEach((row) => { if (!ids.some((id) => id === row.id)) ids = [...ids, row.id]; });',
      errors: [SET('ids', 'some')],
    },
    {
      code: 'var ids = []; var ids = []; for (const r of rows) { if (!ids.includes(r)) ids.push(r); }',
      errors: [SET('ids', 'includes')],
    },
    {
      code: 'const ids = new Array(); for (const r of rows) { if (ids.indexOf(r) < 0) ids.unshift(r); }',
      errors: [SET('ids', 'indexOf')],
    },
    {
      code: 'const rows = load(); for (const e of events) { use(rows.findLast((r) => r.id == e.id)); }',
      errors: [MAP('rows', 'findLast', 'id')],
    },
    {
      code: 'const rows = load(); for (const e of events) { use(rows.findLastIndex((r) => r.id === e.id)); }',
      errors: [MAP('rows', 'findLastIndex', 'id')],
    },
    {
      code: 'const rows = load(); node.addEventListener("x", (e) => rows.find((r) => r.id === e.id));',
      errors: [MAP('rows', 'find', 'id')],
    },
    {
      code: 'const rows = load(); bus.prependListener("x", (e) => rows.some((r) => r.id === e.id));',
      errors: [MAP('rows', 'some', 'id')],
    },
    {
      code: 'const first = rows.toSorted(byDate).at(0);',
      errors: [SORT('toSorted')],
    },
    {
      code: 'const first = rows.toSorted(byDate)["0"];',
      errors: [SORT('toSorted')],
    },
    {
      code: 'const handlers = load(); for (const event of events) { handlers.find((h) => h.message === event.type)?.run(event); }',
      errors: [MAP('handlers', 'find', 'message')],
    },
    {
      code: 'function join(rows: Row[], events: Event[]) { return events.map((e) => rows.findIndex((r) => e.key === r.meta.key)); }',
      errors: [MAP('rows', 'findIndex', 'meta.key')],
    },
    {
      code: 'const known = load(); emitter.on("message", (m) => { if (known.some((k) => { return k.id === m.id; })) handle(m); });',
      errors: [MAP('known', 'some', 'id')],
    },
    {
      code: 'class Bus { constructor(handlers) { this.handlers = handlers; } listen(source) { source.subscribe((event) => this.handlers.find((h) => h.message === event)); } }',
      errors: [MAP('this.handlers', 'find', 'message')],
    },
    {
      code: 'const highest = levels.map((level) => level.value).sort((a, b) => b - a)[0];',
      errors: [SORT('sort')],
    },
    {
      code: 'const newest = rows.toSorted(byDate).at(-1);',
      errors: [SORT('toSorted')],
    },
    {
      code: 'const newest = [...rows].sort(byDate).pop();',
      errors: [SORT('sort')],
    },
    {
      code: 'const [oldest] = Object.values(byId).sort(byDate);',
      errors: [SORT('sort')],
    },
    {
      code: 'function oldest(rows: Row[]) { return rows.sort(byDate).shift(); }',
      errors: [SORT('sort')],
    },
  ].map((test) => ({ filename, ...test })),
});
