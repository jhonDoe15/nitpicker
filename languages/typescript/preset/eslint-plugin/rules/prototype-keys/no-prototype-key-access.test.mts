import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-prototype-key-access.mts';

const tester = typescriptRuleTester();

function write(code: string) {
  return { code, errors: [{ messageId: 'write' }] };
}

function lookup(code: string) {
  return { code, errors: [{ messageId: 'lookup' }] };
}

tester.run('no-prototype-key-access', rule, {
  valid: [
    'function copy(source: Rec) { const out: Rec = {}; for (const key of Object.keys(source)) { out[key] = ' +
      'source[key]; } return out; }',
    'function merge(target: Rec, source: Rec) { for (const key of Object.keys(source)) { if (key === "__proto__" || ' +
      'key === "constructor") { continue; } target[key] = merge(target[key], source[key]); } }',
    'function merge(target: Rec, source: Rec) { for (const key in source) { if (UNSAFE.has(key)) continue; ' +
      'target[key] = merge(target[key], source[key]); } }',
    'function merge(target: Rec, source: Rec) { for (const key in source) { if (isUnsafeKey(key)) continue; ' +
      'target[key] = merge(target[key], source[key]); } }',
    'function merge(target: Rec, source: Rec) { for (const key of Object.keys(source)) { if (!Object.hasOwn(target, ' +
      'key)) { target[key] = source[key]; continue; } target[key] = merge(target[key], source[key]); } }',
    'function merge(target: Rec, source: Rec) { for (const key of Object.keys(source)) { if ' +
      '(target.hasOwnProperty(key)) { target[key] = merge(target[key], source[key]); } } }',
    'function merge(source: Rec) { const target = Object.create(null); for (const key of Object.keys(source)) { ' +
      'target[key] = merge(target[key], source[key]); } }',
    'function merge(target: Map<string, number>, source: Rec) { for (const key of Object.keys(source)) { ' +
      'target.set(key, source[key]); } }',
    'for (const key of ["a", "b"]) { target[key] = target[key] + 1; }',
    'function count(source: Rec) { const counts: Rec = {}; for (const key of Object.keys(source)) { counts[key] = ' +
      '(counts[key] ?? 0) + 1; } return counts; }',
    'function grow(target: Rec, source: Rec) { for (const key of Object.keys(source)) { target[key] = new ' +
      'Big(target[key]); } }',
    'function fill(target: Rec, source: Rec) { for (const key of Object.keys(source)) { target[key][source.id] = ' +
      'source[key]; } }',
    'function other(target: Rec, source: Rec) { for (const key of Object.keys(source)) { target[other] = ' +
      'target[other] + 1; } }',
    'const table = { a: 1, b: 2 }; function has(name: "a" | "b") { return name in table; }',
    'const table = { a: 1 }; function has(name: string) { return Object.hasOwn(table, name); }',
    'const table = { a: 1 }; function has() { return "a" in table; }',
    'const table = { __proto__: null, a: 1 }; function has(name: string) { return name in table; }',
    'const table = Object.create(null); function has(name: string) { return name in table; }',
    'const table = new Map(); function has(name: string) { return table.has(name); }',
    'function has(name: string, table: Rec) { return name in table; }',
    'const table = {}; function has(name: string) { return name in table; }',
    'const table = { a: 1 }; const name = "a"; const ok = name in table;',
    'function sync(config: Rec) { for (const name of Object.keys(config.env)) { config.env[name] = ' +
      'merge(config.env[name], {}); } }',
    'function prepare(record: Rec) { for (const key in record) { record[key] = prepare(record[key]); } }',
    'const overrides = { a: 1 }; const LANGS = ["a", "b"]; const used = LANGS.map((lang) => lang in overrides);',
    'const overrides = { a: 1 }; const used = ["a", "b"].filter((lang) => lang in overrides);',
    'for (const key of Object.keys(source)) { cache[key] = cache[key] + 1; }',
    'for (const key in source) { if (key === "__proto__") continue; target[key] = merge(target[key], source[key]); }',
  ],
  invalid: [
    write(
      'for (const key of Object.keys(source)) { target[key] = merge(target[key], source[key]); }',
    ),
    write(
      'function merge(target: Rec, source: Rec) { for (const key of Object.keys(source.inner)) { target[key] = ' +
        'merge(target[key], source[key]); } }',
    ),
    write(
      'function merge(target: Rec, source: Rec) { for (const key of Object.keys(source)) { target[key] = ' +
        'merge(target[key], source[key]); } }',
    ),
    write(
      'function merge(target: Rec, source: Rec) { for (const key in source) { target[key] = merge(target[key], ' +
        'source[key]); } }',
    ),
    write(
      'function merge(target: Rec, source: Rec) { for (const [key, value] of Object.entries(source)) { target[key] ' +
        '= isObject(value) ? merge(target[key], value) : value; } }',
    ),
    write(
      'function merge(target: Rec, source: Rec) { Object.keys(source).forEach((key) => { target[key] = ' +
        'merge(target[key], source[key]); }); }',
    ),
    write(
      'const combine = (a: Rec, b: Rec) => { Object.keys(b).forEach((key) => { a[key] = deepMerge(a[key], b[key]); ' +
        '}); };',
    ),
    write(
      'const walk = (a: Rec, b: Rec) => { for (const key in b) { a[key] = walk(a[key], b[key]); } };',
    ),
    lookup(
      'const signatures = { a: 1, b: 2 }; function find(name: string) { if (name in signatures) { return ' +
        'signatures[name]; } }',
    ),
    lookup('const signatures = { a: 1 }; function find(name) { return name in signatures; }'),
    lookup('const signatures = { a: 1 }; const has = (req) => req.query.name in signatures;'),
    lookup(
      'const signatures = { a: 1 } as Record<string, number>; function find(name: unknown) { return (name as ' +
        'string) in signatures; }',
    ),
  ],
});
