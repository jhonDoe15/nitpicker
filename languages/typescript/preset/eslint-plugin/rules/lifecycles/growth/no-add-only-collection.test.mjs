import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './no-add-only-collection.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/a/adapters/x.ts';
const inClass = (body) => ({ filename, code: `class SessionService { ${body} }` });
const factory = (body) => ({ filename, code: `function createSessions() { ${body} }` });
const bad = (build, body) => ({ ...build(body), errors: [{ messageId: 'grows' }] });

tester.run('no-add-only-collection', rule, {
  valid: [
    { filename, code: 'class Collector { parts = []; add(x) { this.parts.push(x); } }' },
    inClass(
      'map = new Map(); open(id) { this.map.set(id, 1); } reset() { const { map } = this; map.clear(); }',
    ),
    inClass('map = new Map(); open(id) { this.map.set(id, 1); } reset() { this["map"].clear(); }'),
    {
      filename,
      code: 'class Tracker { pending = new Map(); send(id, resolve, reject) { this.pending.set(id, { resolve, reject }); } close() { this.pending.clear(); } }',
    },
    inClass(
      'map = new Map<string, number>(); open(id: string) { this.map.set(id, 1); } close(id: string) { this.map.delete(id); }',
    ),
    inClass('map = new Map(); open(id) { this.map.set(id, 1); } reset() { this.map.clear(); }'),
    inClass(
      'items: string[] = []; add(x) { this.items.push(x); } drain() { return this.items.splice(0); }',
    ),
    inClass('items = []; add(x) { this.items.push(x); } flush() { this.items = []; }'),
    inClass('map = new Map(); open(id) { if (this.map.size < 100) { this.map.set(id, 1); } }'),
    inClass(
      'map = new Map(); open(id) { this.map.set(id, 1); this.evict(this.map); } evict(map) {}',
    ),
    inClass('map = new Map(); constructor() { this.map.set("a", 1); }'),
    inClass('map = new Map(); register(id) { this.map.set(id, 1); }'),
    inClass('map = new Map(); initHandlers(id) { this.map.set(id, 1); }'),
    inClass('map = new Map(); open() { this.map.set("fixed", 1); }'),
    inClass('map = new WeakMap(); open(key) { this.map.set(key, 1); }'),
    inClass('map = new Map(); read(id) { return this.map.get(id); }'),
    inClass(
      'map = new Map(); constructor() { this.map = new Map(); } read(id) { return this.map.get(id); }',
    ),
    factory(
      'const map = new Map(); function open(id) { map.set(id, 1); } function close(id) { map.delete(id); } return { open, close };',
    ),
    factory(
      'const seen = new Set(); items.forEach((item) => { seen.add(item); }); return seen.size;',
    ),
    factory('const seen = new Set(); return { mark(id) { seen.add(id); } };'),
    factory('const seen = new Set(); for (const item of items) { seen.add(item); } return seen;'),
    {
      filename,
      code: 'const registry = new Map(); export function add(id) { registry.set(id, 1); }',
    },
  ],
  invalid: [
    bad(inClass, 'map = new Map<string, number>(); open(id: string) { this.map.set(id, 1); }'),
    bad(inClass, 'seen = new Set<string>(); mark(id: string) { this.seen.add(id); }'),
    bad(inClass, 'items: string[] = []; add(x: string) { this.items.push(x); }'),
    bad(inClass, 'private readonly runs = new Map(); start(id) { this.runs[id] = 1; }'),
    bad(
      inClass,
      'map: Map<string, number>; constructor() { this.map = new Map(); } open(id) { this.map.set(id, 1); }',
    ),
    bad(inClass, 'map = new Map(); open = (id) => { this.map.set(id, 1); };'),
    bad(
      factory,
      'const sessions = new Map(); function open(id) { sessions.set(id, 1); } function close() {} return { open, close };',
    ),
    bad(
      factory,
      'const seen = new Set(); return { mark: (id) => { seen.add(id); }, dispose() {} };',
    ),
  ],
});
