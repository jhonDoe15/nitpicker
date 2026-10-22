import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../exceptions.mjs';
import {
  exception,
  factFixture,
  findingsOf,
  fixtureFindings,
  rows,
} from '../facts/test-support/fact-fixtures.mjs';

const temporary = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function movesFile(moves) {
  const directory = mkdtempSync(path.join(tmpdir(), 'facts-moves-'));
  temporary.push(directory);
  const file = path.join(directory, 'moves.json');
  writeFileSync(file, JSON.stringify(moves));
  return file;
}

describe('duplicate-definition over facts', () => {
  it('reports a literal constant and a small function defined twice, ignoring test modules', () => {
    expect(rows(fixtureFindings('reuse', ['duplicate-definition']))).toEqual([
      ['duplicate-definition', 'app/billing/pricing.py', 'duplicate:round_total'],
      ['duplicate-definition', 'app/billing/pricing.py', 'duplicate:TAX_RATE'],
      ['duplicate-definition', 'app/orders/pricing.py', 'duplicate:round_total'],
      ['duplicate-definition', 'app/orders/pricing.py', 'duplicate:TAX_RATE'],
    ]);
  });

  it('tells the fix and names the other copy', () => {
    const [finding] = fixtureFindings('reuse', ['duplicate-definition']);

    expect(finding.message).toBe(
      `round_total is also defined with the same code in app/orders/pricing.py. Keep one definition and import it. ${exceptionHint('duplicate-definition', 'app/billing/pricing.py')}`,
    );
  });

  it('compares only within one package', () => {
    const facts = factFixture('reuse');
    const packages = [
      { root: 'app/orders', published: false },
      { root: 'app/billing', published: false },
    ];

    expect(rows(findingsOf({ ...facts, packages }, ['duplicate-definition']))).toEqual([]);
  });

  it('leaves an excepted copy out of the comparison', () => {
    const policy = { exceptions: [exception('duplicate-definition', 'app/billing/**')] };

    expect(fixtureFindings('reuse', ['duplicate-definition'], { policy })).toEqual([]);
  });
});

describe('exported-name-collision over facts', () => {
  it('reports both origins when a module imports two different same-named functions', () => {
    expect(rows(fixtureFindings('reuse', ['exported-name-collision']))).toEqual([
      ['exported-name-collision', 'app/billing/format.py', 'collision:format'],
      ['exported-name-collision', 'app/orders/format.py', 'collision:format'],
    ]);
  });

  it('follows a re-export to the defining module', () => {
    const facts = factFixture('reuse');
    const imports = facts.imports.map((record) =>
      record.to === 'app/billing/format.py' ? { ...record, to: 'app/billing/__init__.py' } : record,
    );
    const barrel = {
      from: 'app/billing/__init__.py',
      to: 'app/billing/format.py',
      names: [{ name: '*' }],
      reexport: true,
    };

    const modules = [...facts.modules, { file: 'app/billing/__init__.py', role: 'production' }];

    expect(
      rows(
        findingsOf({ ...facts, modules, imports: [...imports, barrel] }, [
          'exported-name-collision',
        ]),
      ),
    ).toEqual([
      ['exported-name-collision', 'app/billing/format.py', 'collision:format'],
      ['exported-name-collision', 'app/orders/format.py', 'collision:format'],
    ]);
  });
});

describe('sibling-copy-edit over facts', () => {
  const baseline = (movesFile) => ({ facts: factFixture('sibling-base'), movesFile });

  it('reports the edited copy, reading a moved file from its base path', () => {
    const moves = movesFile([['app/orders/legacy_totals.py', 'app/orders/totals.py']]);

    expect(
      rows(fixtureFindings('sibling-head', ['sibling-copy-edit'], { baseline: baseline(moves) })),
    ).toEqual([['sibling-copy-edit', 'app/orders/totals.py', 'sibling-copy:round_total']]);
  });

  it('treats a copy without a base definition as new', () => {
    expect(
      fixtureFindings('sibling-head', ['sibling-copy-edit'], { baseline: baseline(undefined) }),
    ).toEqual([]);
  });

  it('reports nothing without a base', () => {
    expect(fixtureFindings('sibling-head', ['sibling-copy-edit'])).toEqual([]);
  });

  it('compares across packages only when asked', () => {
    const moves = movesFile([['app/orders/legacy_totals.py', 'app/orders/totals.py']]);
    const packages = [
      { root: 'app/orders', published: false },
      { root: 'app/billing', published: false },
    ];
    const facts = { ...factFixture('sibling-head'), packages };
    const options = { baseline: baseline(moves) };

    expect(findingsOf(facts, ['sibling-copy-edit'], options)).toEqual([]);
    expect(
      rows(
        findingsOf(facts, ['sibling-copy-edit'], {
          ...options,
          siblingCopiesAcrossPackages: true,
        }),
      ),
    ).toEqual([['sibling-copy-edit', 'app/orders/totals.py', 'sibling-copy:round_total']]);
  });
});

function javaFacts(definitions, imports = []) {
  const files = [...new Set(definitions.map(({ file }) => file))];
  return {
    modules: files.map((file) => ({ file, role: 'production' })),
    packages: [],
    definitions,
    imports,
  };
}

function method(file, qualifier, tokens) {
  return {
    file,
    name: 'of',
    qualifier,
    kind: 'function',
    line: 1,
    exported: true,
    usedLocally: true,
    tokens,
  };
}

describe('same-named declarations told apart by qualifier', () => {
  const small = ['return', 'new', 'Money', '(', 'amount', ')'];
  const wide = ['return', 'new', 'Money', '(', 'amount', ',', 'currency', ')'];

  it('reports each copied overload of a duplicate, not one per name', () => {
    const facts = javaFacts([
      method('app/Money.java', 'Money.of(int)', small),
      method('app/Money.java', 'Money.of(int,String)', wide),
      method('app/Price.java', 'Price.of(int)', small),
      method('app/Price.java', 'Price.of(int,String)', wide),
    ]);

    expect(rows(findingsOf(facts, ['duplicate-definition']))).toEqual([
      ['duplicate-definition', 'app/Money.java', 'duplicate:Money.of(int,String)'],
      ['duplicate-definition', 'app/Money.java', 'duplicate:Money.of(int)'],
      ['duplicate-definition', 'app/Price.java', 'duplicate:Price.of(int,String)'],
      ['duplicate-definition', 'app/Price.java', 'duplicate:Price.of(int)'],
    ]);
  });

  it('matches an edited overload with its own base copy', () => {
    const body = Array.from({ length: 24 }, (_, index) => `t${String(index)}`);
    const edited = [...body.slice(0, 22), 'changed', 't23'];
    const head = javaFacts([
      method('app/Money.java', 'Money.of(int)', edited),
      method('app/Money.java', 'Money.of(long)', [...body, 'x']),
      method('app/Price.java', 'Price.of(int)', body),
    ]);
    const base = {
      definitions: [
        method('app/Money.java', 'Money.of(int)', body),
        method('app/Money.java', 'Money.of(long)', [...body, 'x']),
        method('app/Price.java', 'Price.of(int)', body),
      ],
    };

    expect(rows(findingsOf(head, ['sibling-copy-edit'], { baseline: { facts: base } }))).toEqual([
      ['sibling-copy-edit', 'app/Money.java', 'sibling-copy:Money.of(int)'],
    ]);
  });

  it('keeps the name as the identity when no qualifier is given', () => {
    const facts = javaFacts([
      { ...method('app/Money.java', undefined, small), qualifier: undefined },
      { ...method('app/Price.java', undefined, small), qualifier: undefined },
    ]);

    expect(rows(findingsOf(facts, ['duplicate-definition']))).toEqual([
      ['duplicate-definition', 'app/Money.java', 'duplicate:of'],
      ['duplicate-definition', 'app/Price.java', 'duplicate:of'],
    ]);
  });
});

describe('facts edge cases', () => {
  it('does not take two declarations without tokens for copies', () => {
    const facts = javaFacts([
      method('app/A.java', 'A.of()', []),
      method('app/B.java', 'B.of()', []),
    ]);

    expect(findingsOf(facts, ['duplicate-definition'])).toEqual([]);
  });

  it('takes the role of an import from its importing module', () => {
    const helper = { ...method('app/Money.java', 'Money.of(int)', ['x']), usedLocally: false };
    const copy = {
      ...helper,
      file: 'app/Price.java',
      qualifier: 'Price.of(int)',
      usedLocally: true,
    };
    const facts = {
      ...javaFacts([helper, copy]),
      modules: [
        { file: 'app/Money.java', role: 'production' },
        { file: 'app/Price.java', role: 'production' },
        { file: 'test/MoneyTest.java', role: 'test' },
      ],
      imports: [{ from: 'test/MoneyTest.java', to: 'app/Money.java', names: [{ name: 'of' }] }],
    };

    expect(findingsOf(facts, ['duplicate-definition'])).toEqual([]);
  });
});
