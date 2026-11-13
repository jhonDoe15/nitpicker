import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../comparison/compare.mjs';
import { finding } from '../../../../execution/test-support/analyzer-findings.mjs';

function held(base, head, moves) {
  const comparison = compareFindings({
    baseFindings: [base],
    headFindings: [head],
    baseToHeadRenames: moves.renames ?? new Map(),
    baseToHeadDirectories: moves.directories ?? new Map(),
    baseToHeadPackages: moves.packages ?? new Map(),
  });
  return { fresh: comparison.newFindings.length, kept: comparison.unchangedFindings.length };
}

describe('duplicate clones after a rename that changes which file sorts first', () => {
  const base = finding({
    tool: 'duplicates',
    rule: 'duplicate-clone',
    path: 'src/a.ts',
    identity: 'pair:src/a.ts|src/b.ts:fragment:abc:occurrence:1',
  });
  const head = {
    ...base,
    path: 'src/b.ts',
    identity: 'pair:src/b.ts|src/z.ts:fragment:abc:occurrence:1',
  };

  it('keeps the clone legacy', () => {
    expect(held(base, head, { renames: new Map([['src/a.ts', 'src/z.ts']]) })).toEqual({
      fresh: 0,
      kept: 1,
    });
  });
});

describe('findings that name a relative import specifier', () => {
  const importFinding = (filePath, specifier) =>
    finding({
      tool: 'typescript-typecheck',
      rule: 'TS2307',
      path: filePath,
      identity: `message:Cannot find module '${specifier}' or its corresponding type declarations.|occurrence:1`,
    });
  const pythonFinding = (specifier) =>
    finding({ tool: 'python', rule: 'x', path: 'src/a.py', identity: `'${specifier}'` });

  it.each([
    {
      name: 'an importer that moved while its target stayed',
      base: ['src/orders/a.ts', './b.js'],
      head: ['src/billing/a.ts', '../orders/b.js'],
      renames: [['src/orders/a.ts', 'src/billing/a.ts']],
      expected: { fresh: 0, kept: 1 },
    },
    {
      name: 'an importer whose target moved',
      base: ['src/orders/a.ts', './b'],
      head: ['src/orders/a.ts', '../lib/b'],
      renames: [['src/orders/b.ts', 'src/lib/b.ts']],
      expected: { fresh: 0, kept: 1 },
    },
    {
      name: 'a target imported through its index file',
      base: ['src/a.ts', './orders'],
      head: ['src/a.ts', './sales'],
      renames: [['src/orders/index.ts', 'src/sales/index.ts']],
      expected: { fresh: 0, kept: 1 },
    },
    {
      name: 'another specifier as new',
      base: ['src/orders/a.ts', './b'],
      head: ['src/orders/a.ts', './c'],
      renames: [['src/orders/b.ts', 'src/lib/b.ts']],
      expected: { fresh: 1, kept: 0 },
    },
    {
      name: 'a specifier of an unmoved importer and target as it was',
      base: ['src/a.ts', './b'],
      head: ['src/a.ts', './b'],
      renames: [],
      expected: { fresh: 0, kept: 1 },
    },
  ])('treats $name', ({ base, head, renames, expected }) => {
    expect(
      held(importFinding(...base), importFinding(...head), { renames: new Map(renames) }),
    ).toEqual(expected);
  });

  it('leaves the specifiers of other languages alone', () => {
    expect(
      held(pythonFinding('./b'), pythonFinding('../lib/b'), {
        renames: new Map([['src/b.py', 'lib/b.py']]),
      }),
    ).toEqual({ fresh: 1, kept: 0 });
  });
});

describe('package findings after the whole package moved', () => {
  const edge = (source, target) =>
    finding({
      tool: 'coupling',
      rule: 'stability-direction',
      path: source,
      identity: `package-edge:${source}->${target}`,
    });
  const metric = (name) =>
    finding({
      tool: 'coupling',
      rule: 'package-coupling',
      path: '.',
      classification: 'descriptive',
      identity: `package:${name}:fanIn`,
    });

  it.each([
    ['java', 'shop.service', 'shop.audit', 'shop.web'],
    ['kotlin', 'com.shop.service', 'com.shop.audit', 'com.shop.web'],
    ['typescript', 'orders', 'ordering', 'billing'],
  ])('keeps a %s edge from the moved package', (_language, from, to, other) => {
    const packages = new Map([[from, to]]);

    expect(held(edge(from, other), edge(to, other), { packages })).toEqual({ fresh: 0, kept: 1 });
    expect(held(edge(from, other), edge(to, other), {})).toEqual({ fresh: 1, kept: 0 });
  });

  it('keeps an edge to the moved package and an edge between two moved packages', () => {
    const packages = new Map([
      ['shop.service', 'shop.audit'],
      ['shop.web', 'shop.site'],
    ]);
    const towards = (source, target) => ({
      ...edge(source, target),
      path: source,
    });

    expect(
      held(towards('shop.app', 'shop.service'), towards('shop.app', 'shop.audit'), { packages }),
    ).toEqual({
      fresh: 0,
      kept: 1,
    });
    expect(
      held(towards('shop.service', 'shop.web'), towards('shop.audit', 'shop.site'), { packages }),
    ).toEqual({
      fresh: 0,
      kept: 1,
    });
  });

  it('keeps the package metrics of the moved package', () => {
    const packages = new Map([['shop.service', 'shop.audit']]);

    expect(held(metric('shop.service'), metric('shop.audit'), { packages })).toEqual({
      fresh: 0,
      kept: 1,
    });
    expect(held(metric('shop.service'), metric('shop.audit'), {})).toEqual({ fresh: 1, kept: 0 });
  });

  it('keeps a Python namespace package cycle', () => {
    const cycle = (...members) =>
      finding({
        tool: 'python',
        rule: 'package-cycle',
        path: members.toSorted((left, right) => left.localeCompare(right))[0],
        identity: `cycle:${members.join('>')}`,
      });
    const packages = new Map([['shop.service', 'shop.billing']]);

    expect(
      held(cycle('shop.service', 'shop.web'), cycle('shop.billing', 'shop.web'), { packages }),
    ).toEqual({ fresh: 0, kept: 1 });
  });

  it('does not move a package that is not in the map', () => {
    const packages = new Map([['shop.service', 'shop.audit']]);

    expect(held(edge('shop.web', 'shop.app'), edge('shop.site', 'shop.app'), { packages })).toEqual(
      {
        fresh: 1,
        kept: 0,
      },
    );
  });
});
