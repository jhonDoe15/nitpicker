import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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

    expect(finding.message).toContain(
      'round_total is also defined with the same code in app/orders/pricing.py. Keep one definition and import it.',
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

    expect(
      rows(findingsOf({ ...facts, imports: [...imports, barrel] }, ['exported-name-collision'])),
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
