import { describe, expect, it } from 'vitest';
import { goFactFindings } from './go-fact-findings.mjs';
import { goFacts } from './go-facts.mjs';

function file(path, extra = {}) {
  return {
    path,
    package: extra.package ?? path.split('/').at(-2) ?? 'root',
    test: path.endsWith('_test.go'),
    generated: false,
    constrained: false,
    ...extra,
  };
}

function definition(path, name, extra = {}) {
  return {
    file: path,
    name,
    kind: 'function',
    line: 3,
    lines: 3,
    exported: /^[A-Z]/u.test(name),
    entry: false,
    literal: false,
    tokens: ['func', name],
    ...extra,
  };
}

function usage(path, extra = {}) {
  return { file: path, imports: [], names: [], selectors: [], local: [], ...extra };
}

const STORE = 'example.com/shop/internal/store';

const REPORT = {
  files: [
    file('cmd/app/main.go', { package: 'main' }),
    file('internal/store/store.go'),
    file('internal/store/helper.go'),
    file('internal/store/store_test.go'),
    file('internal/store/export_test.go', { package: 'store_test' }),
  ],
  definitions: [
    definition('cmd/app/main.go', 'main', { entry: true }),
    definition('internal/store/store.go', 'New'),
    definition('internal/store/store.go', 'Item', { kind: 'type' }),
    definition('internal/store/helper.go', 'OnlyTests'),
    definition('internal/store/helper.go', 'Fixture'),
    definition('internal/store/helper.go', 'helper'),
  ],
  usages: [
    usage('cmd/app/main.go', {
      imports: [{ path: STORE, name: 'shop', line: 4 }],
      names: ['shop'],
      selectors: [{ qualifier: 'shop', name: 'New' }],
    }),
    usage('internal/store/store.go', { names: ['helper'], local: ['Item'] }),
    usage('internal/store/helper.go'),
    usage('internal/store/store_test.go', { names: ['OnlyTests', 'helper'] }),
    usage('internal/store/export_test.go', {
      imports: [{ path: STORE, name: '', line: 3 }],
      names: ['Fixture'],
      selectors: [{ qualifier: 'store', name: 'Fixture' }],
    }),
  ],
};

function rows(findings) {
  return findings.map(({ rule, path, symbol }) => `${rule} ${path} ${symbol}`);
}

describe('Go facts', () => {
  it('links names used across files of a package, selectors into module packages and same-file uses', () => {
    expect(goFacts(REPORT, { module: 'example.com/shop' }).imports).toEqual([
      {
        from: 'cmd/app/main.go',
        to: 'internal/store/store.go',
        names: [{ name: 'New' }],
        role: 'production',
      },
      {
        from: 'internal/store/store.go',
        to: 'internal/store/helper.go',
        names: [{ name: 'helper' }],
        role: 'production',
      },
      {
        from: 'internal/store/store.go',
        to: 'internal/store/store.go',
        names: [{ name: 'Item' }],
        role: 'production',
      },
      {
        from: 'internal/store/store_test.go',
        to: 'internal/store/helper.go',
        names: [{ name: 'helper' }, { name: 'OnlyTests' }],
        role: 'test',
      },
      {
        from: 'internal/store/export_test.go',
        to: 'internal/store/helper.go',
        names: [{ name: 'Fixture' }],
        role: 'test',
      },
    ]);
  });

  it('reports exported names only tests use, in packages other modules cannot import', () => {
    const facts = goFacts(REPORT, { module: 'example.com/shop' });
    expect(rows(goFactFindings(facts))).toEqual([
      'test-only-export internal/store/helper.go Fixture',
      'test-only-export internal/store/helper.go OnlyTests',
    ]);
  });

  it('counts the exported API of an importable package as used', () => {
    const report = {
      ...REPORT,
      files: REPORT.files.map((entry) => ({ ...entry, path: entry.path.replace('internal/', '') })),
      definitions: REPORT.definitions.map((entry) => ({
        ...entry,
        file: entry.file.replace('internal/', ''),
      })),
      usages: REPORT.usages.map((entry) => ({
        ...entry,
        file: entry.file.replace('internal/', ''),
        imports: entry.imports.map((spec) => ({
          ...spec,
          path: spec.path.replace('internal/', ''),
        })),
      })),
    };
    const facts = goFacts(report, { module: 'example.com/shop' });
    expect(facts.packages).toEqual([
      { root: 'cmd/app', published: false },
      { root: 'store', published: true },
    ]);
    expect(goFactFindings(facts)).toEqual([]);
  });

  it('judges every package of a module other modules cannot fetch', () => {
    const facts = goFacts(REPORT, { module: 'shop' });
    expect(facts.packages.map(({ published }) => published)).toEqual([false, false]);
  });

  it('links a blank or method-only import to every file of the package, and resolves dot imports', () => {
    const report = {
      files: [
        file('app/main.go', { package: 'main' }),
        file('app/dot.go', { package: 'main' }),
        file('features/cart/cart.go'),
        file('shared/money/money.go'),
        file('shared/money/round.go'),
      ],
      definitions: [definition('shared/money/round.go', 'Round')],
      usages: [
        usage('app/main.go', { imports: [{ path: 'shop/shared/money', name: '_', line: 3 }] }),
        usage('app/dot.go', {
          imports: [{ path: 'shop/shared/money', name: '.', line: 3 }],
          names: ['Round'],
        }),
        usage('features/cart/cart.go', {
          imports: [{ path: 'shop/shared/money', name: '', line: 3 }],
          names: ['money'],
          selectors: [{ qualifier: 'money', name: 'Round' }],
        }),
        usage('shared/money/money.go'),
        usage('shared/money/round.go'),
      ],
    };
    const facts = goFacts(report, { module: 'shop' });
    expect(facts.imports.map(({ from, to, names }) => [from, to, names.length])).toEqual([
      ['app/main.go', 'shared/money/money.go', 0],
      ['app/main.go', 'shared/money/round.go', 0],
      ['app/dot.go', 'shared/money/round.go', 1],
      ['features/cart/cart.go', 'shared/money/round.go', 1],
    ]);
  });

  it('reports shared code that one feature alone uses', () => {
    const report = {
      files: [file('features/cart/cart.go'), file('shared/money/round.go')],
      definitions: [definition('shared/money/round.go', 'Round')],
      usages: [
        usage('features/cart/cart.go', {
          imports: [{ path: 'shop/shared/money', name: '', line: 3 }],
          names: ['money'],
          selectors: [{ qualifier: 'money', name: 'Round' }],
        }),
        usage('shared/money/round.go'),
      ],
    };
    const findings = goFactFindings(goFacts(report, { module: 'shop' }));
    expect(findings.map(({ rule, path }) => `${rule} ${path}`)).toEqual([
      'shared-used-by-one-feature shared/money/round.go',
    ]);
    expect(
      goFactFindings(goFacts(report, { module: 'shop' }), {
        policy: { layout: { sharedRoots: ['lib'] } },
      }),
    ).toEqual([]);
  });
});
