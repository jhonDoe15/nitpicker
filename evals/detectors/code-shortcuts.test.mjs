import { describe, expect, it } from 'vitest';
import { detectCodeShortcuts } from './code-shortcuts.mjs';
import { detectShortcuts } from './index.mjs';

const detect = (fixture, final, options) => detectCodeShortcuts({ fixture, final, ...options });
const kinds = (shortcuts) => shortcuts.map((shortcut) => shortcut.kind);
const base = { 'src/a.ts': 'export const a = 1;\n' };
const withCode = (code) => ({ 'src/a.ts': `${base['src/a.ts']}${code}\n` });

describe('type system escapes', () => {
  it('reports as assertions with the asserted type and line', () => {
    expect(detect(base, withCode('export const b = a as number;'))).toEqual([
      {
        category: 'code-shortcuts',
        kind: 'type-assertion',
        path: 'src/a.ts',
        line: 2,
        detail: 'type assertion: as number',
      },
    ]);
  });

  it('reports a double assertion through unknown as two assertions', () => {
    expect(kinds(detect(base, withCode('export const b = a as unknown as string;')))).toEqual([
      'type-assertion',
      'type-assertion',
    ]);
  });

  it('reports angle-bracket assertions', () => {
    expect(detect(base, withCode('export const b = <number>(a as unknown);'))[0].detail).toBe(
      'type assertion: <number>',
    );
  });

  it('allows as const, import aliases and satisfies', () => {
    const final = {
      'src/a.ts': `import { x as y } from './x';\nexport { y as z };\nexport const b = [1] as const;\nexport const c = { a: 1 } satisfies object;\n`,
    };
    expect(detect({}, final)).toEqual([]);
  });

  it('reports any in annotations, generics, and catch variables', () => {
    const final = withCode(
      'export function f(x: any, y: Array<any>) { try { return x; } catch (e: any) { throw e; } }',
    );
    expect(kinds(detect(base, final))).toEqual(['any', 'any', 'any']);
  });

  it('does not report the word any in strings or comments', () => {
    expect(detect(base, withCode('// any value\nexport const s = "any";'))).toEqual([]);
  });

  it('reports non-null assertions', () => {
    const final = withCode('export const m = new Map<string, number>().get("k")!;');
    expect(detect(base, final)).toMatchObject([
      {
        kind: 'non-null-assertion',
        detail: 'non-null assertion: new Map<string, number>().get("k")!',
      },
    ]);
  });

  it('does not report logical not or definite assignment', () => {
    const final = withCode('export const n = !a;\nexport class C { v!: number; }');
    expect(detect(base, final)).toEqual([]);
  });

  it('ignores constructs that already existed, even when the line moved', () => {
    const before = { 'src/a.ts': 'export const b = Number("1") as number;\n' };
    const after = {
      'src/a.ts': 'export const first = 0;\nexport const b = Number("1") as number;\n',
    };
    expect(detect(before, after)).toEqual([]);
  });

  it('reports an additional copy of an existing construct', () => {
    const before = { 'src/a.ts': 'export const b = Number("1") as number;\n' };
    const after = { 'src/a.ts': `${before['src/a.ts']}export const c = Number("2") as number;\n` };
    expect(kinds(detect(before, after))).toEqual(['type-assertion']);
  });

  it('reports new files', () => {
    expect(detect(base, { ...base, 'src/b.ts': 'export const b: any = 1;\n' })).toMatchObject([
      { kind: 'any', path: 'src/b.ts' },
    ]);
  });
});

describe('feature boundaries', () => {
  const feature = (name, file, code) => ({
    [`src/main/features/${name}/${file}`]: code,
  });
  const fixture = {
    ...feature('billing', 'index.ts', 'export { charge } from "./domain/charge";\n'),
    ...feature('billing', 'domain/charge.ts', 'export const charge = 1;\n'),
    ...feature('users', 'index.ts', 'export const user = 1;\n'),
    'src/main/main.ts': 'import { user } from "./features/users";\nexport const main = user;\n',
  };

  it('reports a feature importing another feature internals', () => {
    const final = {
      ...fixture,
      ...feature(
        'users',
        'index.ts',
        'import { charge } from "../billing/domain/charge";\nexport const user = charge;\n',
      ),
    };
    expect(detect(fixture, final)).toMatchObject([
      {
        kind: 'cross-feature-import',
        path: 'src/main/features/users/index.ts',
        detail:
          'feature users imports ../billing/domain/charge, internals of feature billing; import its index instead',
      },
    ]);
  });

  it('allows importing another feature through its index, with or without the filename', () => {
    const final = {
      ...fixture,
      ...feature(
        'users',
        'index.ts',
        'import { charge } from "../billing";\nimport { charge as c2 } from "../billing/index.js";\nexport const user = [charge, c2];\n',
      ),
    };
    expect(detect(fixture, final)).toEqual([]);
  });

  it('allows a feature to import its own internals', () => {
    const final = {
      ...fixture,
      ...feature(
        'billing',
        'adapters/db.ts',
        'import { charge } from "../domain/charge";\nexport const db = charge;\n',
      ),
    };
    expect(detect(fixture, final)).toEqual([]);
  });

  it('reports shared code deep-importing a feature, dynamic imports, and re-exports', () => {
    const final = {
      ...fixture,
      'src/main/main.ts':
        'import { charge } from "./features/billing/domain/charge";\nexport * from "./features/billing/domain/charge";\nexport const lazy = () => import("./features/billing/domain/charge");\nexport const main = charge;\n',
    };
    const result = detect(fixture, final);
    expect(kinds(result)).toEqual([
      'cross-feature-import',
      'cross-feature-import',
      'cross-feature-import',
    ]);
    expect(result[0].detail).toContain('outside the features directory');
  });

  it('supports a custom features root', () => {
    const before = {
      'app/f/a/index.ts': 'export const a = 1;\n',
      'app/f/b/index.ts': 'export const b = 1;\n',
    };
    const after = {
      ...before,
      'app/f/b/index.ts': 'import { a } from "../a/internal";\nexport const b = a;\n',
    };
    expect(detect(before, after, { featuresRoot: 'app/f' })).toHaveLength(1);
    expect(detect(before, after)).toEqual([]);
  });
});

describe('shared entry points', () => {
  const fixture = {
    'src/main/main.ts': 'export function main(kind: string) {\n  return kind.length;\n}\n',
  };

  it('reports new branches added to an existing shared file', () => {
    const final = {
      'src/main/main.ts':
        'export function main(kind: string) {\n  if (kind === "invoice") {\n    return 1;\n  }\n  switch (kind) {\n    case "refund":\n      return 2;\n    default:\n      return kind.length;\n  }\n}\n',
    };
    expect(detect(fixture, final)).toMatchObject([
      {
        kind: 'shared-entry-branch',
        path: 'src/main/main.ts',
        detail: '2 new branches in shared file; add a feature directory instead',
      },
    ]);
  });

  it('counts ternaries and reports a single branch in the singular', () => {
    const final = {
      'src/main/main.ts':
        'export function main(kind: string) {\n  return kind ? kind.length : 0;\n}\n',
    };
    expect(detect(fixture, final)[0].detail).toBe(
      '1 new branch in shared file; add a feature directory instead',
    );
  });

  it('allows branches inside features, in tests, and in brand-new shared files', () => {
    expect(
      detect(
        { 'src/main/features/a/index.ts': 'export const a = 1;\n' },
        { 'src/main/features/a/index.ts': 'export const a = Math.random() ? 1 : 2;\n' },
      ),
    ).toEqual([]);
    expect(
      detect(
        { 'src/x.test.ts': 'it("x", () => {});\n' },
        { 'src/x.test.ts': 'it("x", () => { if (1) {} });\n' },
      ),
    ).toEqual([]);
    expect(
      detect(fixture, { ...fixture, 'src/main/new.ts': 'export const n = 1 ? 2 : 3;\n' }),
    ).toEqual([]);
  });

  it('does not report a rewrite that keeps the branch count', () => {
    const final = {
      'src/main/main.ts': 'export function main(kind: string) {\n  return kind.length + 1;\n}\n',
    };
    expect(detect(fixture, final)).toEqual([]);
  });
});

describe('ignored errors', () => {
  it.each([
    ['an empty catch', 'try { run(); } catch {}'],
    ['a catch with only a comment', 'try { run(); } catch (e) { /* ignore */ }'],
    ['a catch that only returns', 'function f() { try { run(); } catch { return; } }'],
    [
      'a catch that returns undefined',
      'function f() { try { run(); } catch { return undefined; } }',
    ],
    ['an empty .catch handler', 'run().catch(() => {});'],
    ['a .catch handler returning undefined', 'run().catch(() => undefined);'],
    ['a noop .catch handler', 'run().catch(noop);'],
  ])('reports %s', (_name, code) => {
    const final = withCode(
      `declare function run(): Promise<void>;\ndeclare const noop: () => void;\n${code}`,
    );
    expect(kinds(detect(base, final))).toEqual(['ignored-error']);
  });

  it.each([
    ['rethrow', 'try { run(); } catch (e) { throw new Error("x", { cause: e }); }'],
    ['logging', 'try { run(); } catch (e) { log(e); }'],
    ['a result', 'function f() { try { run(); } catch { return { ok: false }; } }'],
    ['a handler that does something', 'run().catch((e) => log(e));'],
  ])('does not report %s', (_name, code) => {
    const final = withCode(
      `declare function run(): Promise<void>;\ndeclare function log(e: unknown): void;\n${code}`,
    );
    expect(detect(base, final)).toEqual([]);
  });
});

describe('non-preferred constructs', () => {
  it.each([
    ['forEach', 'items.forEach((item) => use(item));', 'forEach'],
    ['for(;;)', 'for (let i = 0; i < items.length; i++) { use(items[i]); }', 'for(;;) loop'],
    ['for...in', 'for (const k in items) { use(k); }', 'for...in loop'],
    ['while', 'while (items.length > 0) { items.pop(); }', 'while loop'],
    ['do while', 'do { items.pop(); } while (items.length > 0);', 'while loop'],
    ['a then chain', 'Promise.resolve(1).then((n) => use(n));', '.then() chain'],
    ['enum', 'enum Color { Red }', 'enum'],
    ['namespace', 'namespace N { export const x = 1; }', 'namespace'],
    ['interface', 'interface Shape { size: number }', 'interface'],
  ])('reports %s', (_name, code, construct) => {
    const final = withCode(
      `declare const items: number[];\ndeclare function use(x: unknown): void;\n${code}`,
    );
    expect(detect(base, final)).toMatchObject([
      { kind: 'non-preferred-construct', detail: construct },
    ]);
  });

  it('allows for...of, map and declare module', () => {
    const final = withCode(
      'declare const items: number[];\nfor (const item of items) { void item; }\nexport const m = items.map((n) => n + 1);\ndeclare module "x" { export const y: number; }',
    );
    expect(detect(base, final)).toEqual([]);
  });
});

describe('detectShortcuts', () => {
  it('includes the code shortcuts category', () => {
    const shortcuts = detectShortcuts({
      fixture: base,
      final: withCode('export const b = a as number;'),
    });
    expect(shortcuts.map((shortcut) => shortcut.category)).toEqual(['code-shortcuts']);
  });
});
