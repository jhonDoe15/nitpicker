import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-null-branch-fall-through.mts';

const ruleTester = typescriptRuleTester();

const example = `
function write(value, format) {
  if (value == null) {
    out.append('null');
  }
  let chosen = format;
  if (chosen == null) {
    chosen = formats.get(value.constructor);
  }
  out.append(String(chosen));
}`;

ruleTester.run('no-null-branch-fall-through', rule, {
  valid: cases([
    'function f(x) { if (x == null) { log("none"); return; } return x.name; }',
    'function f(x) { if (x === null) { throw new Error("none"); } return x.name; }',
    'function f(x) { if (x == null) { log("none"); } else { use(x.name); } }',
    'function f(x) { if (x == null) { x = {}; } return x.name; }',
    'function f(x) { if (x === undefined) { x ??= {}; } return x.name; }',
    'function f(x) { if (x == null) { log("none"); } return x?.name; }',
    'function f(x) { if (x == null) { log("none"); } if (x != null) { use(x.name); } }',
    'function f(x) { if (x == null) { log("none"); } return x && x.name; }',
    'function f(x) { if (x == null) { log("none"); } if (x == null) { return; } return x.name; }',
    'function f(x) { if (x == null) { log("none"); } return x ? x.name : 0; }',
    'function f(x) { for (const a of items) { if (x == null) { log("none"); continue; } use(x.name); } }',
    'function f(x) { if (x == null) { log("none"); } return label(x); }',
    'function f(x) { if (x == null) { } return x.name; }',
    'function f(x) { if (x == null) { process.exit(1); } return x.name; }',
    'function f(x) { if (!x) { log("none"); } return x.name; }',
    'function f(x) { if (x == null) { log("none"); } const later = () => x.name; return later; }',
    'function f(x) { if (x == null) { log("none"); } return { ...x }; }',
    'function f(x, y) { if (x == null) { log("none"); } return y.x; }',
    'class A { f() { if (this.item == null) { log("none"); return; } return this.item.name; } }',
    'function f(x) { if (x == null) { out.append("null"); } out.append(label(y)); }',
    'class A { f() { if (this.conn == null) { this.connect(); } return this.conn.query(); } }',
    'class A { async f() { if (this.conn == null) { await this.connect(); } return this.conn.query(); } }',
    'class A { f() { if (this.#conn == null) { open(); } return this.#conn.query(); } }',
    'let cache; function f() { if (cache == null) { init(); } return cache.get(); }',
    'function f(x) { if (x == null) { log("none"); ({ x } = load()); } return x.name; }',
    'function f(x) { if (x == null) { log("none"); [x] = load(); } return x.name; }',
    'function f(x) { if (x == null) { log("none"); } assert(x); return x.name; }',
    'function f(x) { if (x == null) { log("none"); } assert.ok(x); return x.name; }',
    'function f(x) { if (x == null) { log("none"); } invariant(x); return x.name; }',
    'function f(x) { if (x == null) { log("none"); } expect(x).toBeDefined(); return x.name; }',
    'function f(x) { if (x == null) { log("none"); } switch (x) { case 1: return x.name; } }',
    'function f(x) { if (x == null) { log("none"); } if (isNil(x)) { return; } return x.name; }',
    'function f(x) { if (x == null) { log("none"); } if (!isDefined(x)) { return; } return x.name; }',
    'function f(x) { if (x == null) { log("none"); process.abort(); } return x.name; }',
    'function f(x) { if (x == null) { log("none"); fail("no x"); } return x.name; }',
    'function f(x) { if (x == null) { log("none"); this.die(); } return x.name; }',
    'function stop() { throw new Error("stop"); } function f(x) { if (x == null) { log("none"); stop(); } return x.name; }',
  ]),
  invalid: [
    example,
    'function f(x) { if (x == null) { log("none"); } return x.name; }',
    'function f(x) { if (x === null) { log("none"); } return x.name(); }',
    'function f(x) { if (x === undefined) { log("none"); } return x[0]; }',
    'function f(x) { if (x == undefined) { log("none"); } const { a } = x; return a; }',
    'function f(x) { if (x === null || x === undefined) { log("none"); } return x.name; }',
    'function f(x) { if (null == x) { log("none"); } return [...x]; }',
    'function f(x) { if (x == null) log("none"); for (const a of x) use(a); }',
    'function f(x) { if (x == null) { out.append("null"); } out.append(String(x)); }',
    'function f(x) { if (x == null) { log("none"); } const y = 1; return y + x.size; }',
    'class A { f() { if (this.item == null) { log("none"); } return this.item.name; } }',
    'function f(x) { if (x == null) { log("none"); } (() => x.name)(); }',
    'function f(x) { switch (k) { case 1: if (x == null) { log("none"); } use(x.name); } }',
    'function f(x) { if (x == null) { log("none"); } if (x.ready) { go(); } }',
    'function f(x) { if (x == null) { log("none"); } try { x.run(); } catch (error) { log(error); } }',
    'function f(x) { if (x == null) { prepare(); } return x.name; }',
    'class A { f() { if (this.conn == null) { out.append("none"); } return this.conn.query(); } }',
  ].map((code) => ({ code, errors: [{ messageId: 'fallsThrough' as const }] })),
});

ruleTester.run('no-null-branch-fall-through message', rule, {
  valid: [],
  invalid: [
    {
      code: 'function f(x) { if (x == null) { log("none"); } return x.name(); }',
      errors: [
        {
          message:
            'The null branch handles `x` and then falls through to `x.name()`, which uses `x`; add `return` (or an `else`) so the null case is handled once.',
        },
      ],
    },
  ],
});
