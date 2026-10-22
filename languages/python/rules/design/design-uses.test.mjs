import { describe, expect, it } from 'vitest';
import { pythonUsable } from '../../metrics/python-helpers.mjs';
import { designFacts, factsById } from './test-support/design-harness.mjs';

const POLICY = 'policy.py';
const ACCOUNTS = 'accounts.py';

function use(fields, extra = {}) {
  return { param: 0, fields, forwards: [], ...extra };
}

describe.skipIf(!pythonUsable())('the Python design producer parameter uses', () => {
  const byId = factsById(designFacts('uses'));

  it.each([
    ['reads a field', 'inner', [{ param: 0, fields: ['db'], forwards: [] }]],
    ['reads fields through a method call', 'reads_fields', [use(['clock', 'user'])]],
    ['is never touched', 'unused', [use([])]],
    ['is compared with None and then read', 'none_check', [use(['user'])]],
    [
      'is forwarded by position and by keyword',
      'forwards_whole',
      [
        use([], {
          forwards: [
            { target: 'context.py#inner', position: 0 },
            { target: 'context.py#inner_keyword', position: 1 },
          ],
        }),
      ],
    ],
    [
      'is forwarded to a method',
      'forwards_to_method',
      [
        use([], { forwards: [{ target: 'context.py#Service.handle', position: 1 }] }),
        { param: 1, fields: ['handle'], forwards: [] },
      ],
    ],
    [
      'is read and forwarded',
      'mixed',
      [use(['user'], { forwards: [{ target: 'context.py#inner', position: 0 }] })],
    ],
    [
      'is forwarded twice to the same callee',
      'repeated',
      [use(['user'], { forwards: [{ target: 'context.py#inner', position: 0 }] })],
    ],
  ])('lists a parameter that %s', (_label, name, expected) => {
    expect(byId.callable(`context.py#${name}`).paramUses).toEqual(expected);
  });

  it.each([
    ['returned', []],
    ['stored', []],
    ['captured', []],
    ['lambda_capture', []],
    ['reassigned', ['user']],
    ['unresolved_callee', []],
    ['undeclared_position', []],
    ['variadic_position', []],
    ['starred', []],
    ['dunder', []],
    ['dynamic', []],
    ['spread', []],
  ])('marks the parameter of %s as opaque', (name, fields) => {
    expect(byId.callable(`context.py#${name}`).paramUses).toEqual([use(fields, { opaque: true })]);
  });

  it('skips parameters whose type is not a project class', () => {
    expect(byId.callable('context.py#takes_one').paramUses).toBeUndefined();
    expect(byId.callable('context.py#stored').params.map((param) => param.name)).toEqual([
      'ctx',
      'holder',
    ]);
    expect(byId.callable('context.py#stored').paramUses.map((entry) => entry.param)).toEqual([0]);
  });
});

describe.skipIf(!pythonUsable())('the Python design producer decisions', () => {
  const byId = factsById(designFacts('decisions'));
  const STATUS = `${POLICY}#Status`;
  const MODE = `${POLICY}#Mode`;

  it.each([
    [
      'match_enum',
      [{ subject: STATUS, groups: [['OPEN', 'PAID'], ['VOID']], line: 24, otherwise: true }],
    ],
    ['match_literal', [{ subject: MODE, groups: [['fast'], ['slow', 'off']], line: 34 }]],
    ['match_field', [{ subject: `${POLICY}#Order.kind`, groups: [['a'], ['b']], line: 58 }]],
    [
      'chain_equality',
      [{ subject: STATUS, groups: [['OPEN', 'PAID'], ['VOID']], line: 66, otherwise: true }],
    ],
    ['chain_reversed', [{ subject: STATUS, groups: [['OPEN'], ['PAID', 'VOID']], line: 75 }]],
    ['chain_literal', [{ subject: MODE, groups: [['fast'], ['slow', 'off']], line: 82 }]],
    [
      'chain_other_subject',
      [
        { subject: STATUS, groups: [['OPEN']], line: 90, otherwise: true },
        { subject: MODE, groups: [['fast']], line: 92, otherwise: true },
      ],
    ],
    ['chain_single', [{ subject: STATUS, groups: [['OPEN', 'PAID']], line: 99 }]],
    [
      'chain_field',
      [
        {
          subject: `${POLICY}#Order.kind`,
          groups: [['a'], ['b', 'c']],
          line: 104,
          otherwise: true,
        },
      ],
    ],
    [
      'chain_field_values',
      [{ subject: `${POLICY}#Order.priority`, groups: [['1', '2'], ['3']], line: 113 }],
    ],
    [
      'chain_nested',
      [
        { subject: STATUS, groups: [['OPEN']], line: 120 },
        { subject: `${POLICY}#Order.kind`, groups: [['a']], line: 121 },
      ],
    ],
  ])('reads the branches of %s as decisions', (name, expected) => {
    expect(byId.callable(`${POLICY}#${name}`).decisions).toEqual(expected);
  });

  it.each(['match_guarded', 'match_capture', 'field_through_self'])(
    'reads no decision from %s',
    (name) => {
      expect(byId.callable(`${POLICY}#${name}`).decisions).toBeUndefined();
    },
  );

  it('ignores inequality, None checks, untyped subjects, boolean fields and mixed conditions', () => {
    expect(byId.callable(`${POLICY}#not_decisions`).decisions).toEqual([
      { subject: `${POLICY}#Order.note`, groups: [['x']], line: 135 },
    ]);
  });
});

describe.skipIf(!pythonUsable())('the Python design producer reads', () => {
  const byId = factsById(designFacts('reads'));
  const CUSTOMER = `${ACCOUNTS}#Customer`;

  it.each([
    ['Account.label', [{ type: CUSTOMER, fields: ['tier', 'name'], line: 24, decided: ['tier'] }]],
    ['Account.compare', [{ type: `${ACCOUNTS}#Account`, fields: ['limit'], line: 29 }]],
    [
      'local_value',
      [{ type: CUSTOMER, fields: ['balance', 'tier', 'name'], line: 34, decided: ['name'] }],
    ],
    [
      'parameter_value',
      [
        {
          type: CUSTOMER,
          fields: ['active', 'balance', 'name', 'tier'],
          line: 39,
          decided: ['active', 'balance', 'tier'],
        },
      ],
    ],
    ['alias_value', [{ type: CUSTOMER, fields: ['name', 'tier'], line: 48 }]],
  ])('records the fields %s reads off a typed value', (name, expected) => {
    expect(byId.callable(`${ACCOUNTS}#${name}`).reads).toEqual(expected);
  });

  it.each(['untyped_value', 'shadowed_value', 'Customer.greet'])(
    'records no read in %s',
    (name) => {
      expect(byId.callable(`${ACCOUNTS}#${name}`).reads).toBeUndefined();
    },
  );

  it('records property reads as accessor calls', () => {
    expect(byId.callable(`${ACCOUNTS}#parameter_value`).calls).toEqual([
      { target: `${CUSTOMER}.active`, line: 39, receiver: 'customer' },
      { target: `${CUSTOMER}.greet`, line: 40, receiver: 'customer' },
    ]);
  });
});

describe.skipIf(!pythonUsable())('the Python design producer owned state', () => {
  const facts = designFacts('owned');
  const byId = factsById(facts);

  it('describes module and class state, where a rebound global is not mutable', () => {
    expect(byId.type('store.py').fields).toEqual([
      { name: 'CONFIG' },
      { name: 'TABLE', mutable: true },
      { name: '_HIDDEN', mutable: true, private: true },
    ]);
    expect(byId.type('store.py#Store').fields).toEqual([
      { name: 'registry', mutable: true },
      { name: '_rows', mutable: true, private: true },
      { name: 'name' },
    ]);
  });

  it.each([
    ['get_config', ['CONFIG'], 'CONFIG'],
    ['get_table', ['TABLE'], 'TABLE'],
    ['copy_table', ['TABLE'], undefined],
    ['set_config', ['CONFIG'], undefined],
    ['local_shadow', undefined, undefined],
    ['hidden_size', ['_HIDDEN'], undefined],
    ['Store.rows', ['_rows'], '_rows'],
    ['Store.rows_copy', ['_rows'], undefined],
    ['Store.rows_slice', ['_rows'], undefined],
    ['Store.rows_when', ['_rows'], '_rows'],
    ['Store.rows_or_none', ['_rows'], '_rows'],
    ['Store.rows_alias', ['_rows'], '_rows'],
    ['Store.rows_reassigned', ['_rows'], undefined],
    ['Store.view', ['_rows'], '_rows'],
    ['Store.shared', ['registry'], 'registry'],
    ['Store.touch', ['_rows', 'name'], undefined],
    ['Store.untouched', undefined, undefined],
  ])('%s owns %j and returns %j', (name, ownFields, returnsField) => {
    const fact = byId.callable(`store.py#${name}`);

    expect(fact.ownFields).toEqual(ownFields);
    expect(fact.returnsField).toEqual(returnsField);
  });
});
