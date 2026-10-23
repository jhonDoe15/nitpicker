import { describe, expect, it } from 'vitest';
import { designFacts, designRun, fn, owner, summaries } from '../test-support/design-facts.mjs';

const address = ['street', 'city', 'zip'].map((name) => ({ name, type: 'string' }));

function shipping(extra = {}) {
  const modules = ['src/a/ship.ts', 'src/a/bill.ts', 'src/b/label.ts'].map((file) => owner(file));
  const sites = modules.map((module, index) =>
    fn(module, `f${String(index)}`, {
      params: [...address, { name: 'weight', type: 'number' }],
      ...extra,
    }),
  );
  return designFacts({ types: modules, callables: sites });
}

describe('data-clump', () => {
  it('reports typed parameters that travel together through three exported functions', () => {
    const findings = designRun(shipping(), 'data-clump');
    expect(summaries(findings)).toEqual([
      {
        rule: 'data-clump',
        path: 'src/a/bill.ts',
        identity: 'city: string, street: string, weight: number, zip: string',
        classification: 'descriptive',
        line: 2,
      },
    ]);
    expect(findings[0].message).toBe(
      'The parameters `city: string`, `street: string`, `weight: number` and `zip: string` travel together through 3 functions: f1 (src/a/bill.ts:2), f0 (src/a/ship.ts:2), f2 (src/b/label.ts:2). Give them one value type that owns their rules and pass that instead. If this is intended, add {"rule":"data-clump","paths":["src/a/bill.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('names an existing type that has the fields', () => {
    const facts = shipping();
    const parcel = owner('src/a/parcel.ts', 'Parcel', {
      kind: 'data',
      fields: ['street', 'city', 'zip', 'weight'].map((name) => ({ name })),
    });
    const [finding] = designRun(
      {
        ...facts,
        types: [...facts.types, parcel],
        modules: [...facts.modules, { file: 'src/a/parcel.ts', role: 'production' }],
      },
      'data-clump',
    );
    expect(finding.message.split('. ')[1]).toBe(
      'Use Parcel, which already has these fields, and pass that instead',
    );
  });

  it.each([
    ['untyped parameters', { params: address.map(({ name }) => ({ name })) }],
    ['entries', { entry: true }],
    ['functions other modules cannot call', { exported: false }],
    ['coordinates', { params: ['x', 'y', 'z'].map((name) => ({ name, type: 'number' })) }],
  ])('passes %s', (_, extra) => {
    expect(designRun(shipping(extra), 'data-clump')).toEqual([]);
  });
});

const orders = owner('src/orders/orders.ts');
const members = ['create', 'cancel', 'exportCsv', 'exportPdf'].map((name) => fn(orders, name));
const [create, cancel, exportCsv, exportPdf] = members;

function consumers(extra = []) {
  const users = [
    ['src/checkout/buy.ts', [create, cancel]],
    ['src/admin/undo.ts', [cancel]],
    ['src/reports/export.ts', [exportCsv, exportPdf]],
  ].map(([file, used]) =>
    fn(owner(file), 'use', { calls: used.map(({ id }) => ({ target: id, line: 3 })) }),
  );
  return designFacts({
    types: [orders, ...users.map(({ file }) => owner(file))],
    callables: [...members.map((member, index) => ({ ...member, ...extra[index] })), ...users],
  });
}

describe('disjoint-consumer-groups', () => {
  it('reports a module whose callers split into groups that share nothing inside it', () => {
    const findings = designRun(consumers(), 'disjoint-consumer-groups');
    expect(summaries(findings)).toEqual([
      {
        rule: 'disjoint-consumer-groups',
        path: 'src/orders/orders.ts',
        identity: 'src/orders/orders.ts',
        classification: 'descriptive',
        line: 1,
      },
    ]);
    expect(findings[0].message.split('. ')[0]).toBe(
      'orders serves 2 separate groups of callers that share no state or helper inside it: `cancel` and `create` (used by src/admin/undo.ts, src/checkout/buy.ts); `exportCsv` and `exportPdf` (used by src/reports/export.ts)',
    );
  });

  it.each([
    ['a shared field', [{ ownFields: ['cache'] }, {}, { ownFields: ['cache'] }, {}]],
    [
      'a shared helper',
      [{ calls: [{ target: 'src/orders/orders.ts#exportPdf', line: 4 }] }, {}, {}, {}],
    ],
    ['a helper used as a value', [{ references: ['src/orders/orders.ts#exportPdf'] }, {}, {}, {}]],
  ])('passes groups linked by %s', (_, extra) => {
    expect(designRun(consumers(extra), 'disjoint-consumer-groups')).toEqual([]);
  });

  it.each([
    ['a callable that passes them as values', 'callables'],
    ['module-level code of another module', 'types'],
  ])('passes groups that %s uses together', (_, list) => {
    const facts = consumers();
    const user =
      list === 'types' ? owner('src/tables/shapes.ts') : fn(owner('src/tables/shapes.ts'), 'run');
    const both = { ...user, references: [create.id, exportCsv.id] };
    const types = [
      ...facts.types,
      ...(list === 'types' ? [both] : [owner('src/tables/shapes.ts')]),
    ];
    const callables = [...facts.callables, ...(list === 'types' ? [] : [both])];
    const modules = [...facts.modules, { file: 'src/tables/shapes.ts', role: 'production' }];
    expect(designRun({ ...facts, modules, types, callables }, 'disjoint-consumer-groups')).toEqual(
      [],
    );
  });

  it('passes an owner on the public surface of a published package', () => {
    const facts = consumers();
    const published = facts.types.map((type) =>
      type.id === orders.id ? { ...type, published: true } : type,
    );
    expect(designRun({ ...facts, types: published }, 'disjoint-consumer-groups')).toEqual([]);
  });
});
