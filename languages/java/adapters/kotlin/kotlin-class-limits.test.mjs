import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { readKotlinClassLimitFindings } from './kotlin-class-limits.mjs';

const file = 'src/main/kotlin/demo/Shapes.kt';
const type = (name, values = {}) => ({
  file,
  name,
  start: 3,
  kind: 'class',
  methods: 1,
  fields: 1,
  ...values,
});
const metrics = (types, imports = []) => ({
  functions: [],
  files: [
    { file, package: 'demo', classes: [], imports },
    { file: 'src/main/kotlin/other/Base.kt', package: 'other', classes: [], imports: [] },
  ],
  types,
});

describe('readKotlinClassLimitFindings', () => {
  it('reports a class over the method limit with the allowed form, a ratchet and the exception route', () => {
    const [finding] = readKotlinClassLimitFindings(metrics([type('Orders', { methods: 21 })]));

    expect(finding).toEqual({
      tool: 'structure',
      rule: 'class-methods-limit',
      path: file,
      identity: 'methods:Orders:occurrence:1:21',
      message: `Class Orders has 21 methods (limit 20). Split it into classes by responsibility. ${exceptionHint('class-methods-limit', file)}`,
      allowedForm: 'Split it into classes by responsibility.',
      classification: 'enforceable',
      location: { line: 3 },
      ratchet: {
        key: 'methods',
        value: 21,
        worseMessage: `Class Orders grew from {base} to 21 methods (limit 20). Put the new method in a new class. ${exceptionHint('class-methods-limit', file)}`,
        worseAllowedForm: 'Put the new method in a new class.',
        heldMessage:
          'Class Orders: 21 methods (limit 20), allowed because base was {base}; any increase fails.',
      },
    });
  });

  it('takes the class limits from the thresholds config', () => {
    const types = [type('Orders', { methods: 25, fields: 4 })];

    expect(
      readKotlinClassLimitFindings(metrics(types), { thresholds: { classMethods: 30 } }),
    ).toEqual([]);
    expect(
      readKotlinClassLimitFindings(metrics(types), { thresholds: { classFields: 3 } }).map(
        ({ rule, message }) => [rule, message.split('.')[0]],
      ),
    ).toEqual([
      ['class-methods-limit', 'Class Orders has 25 methods (limit 20)'],
      ['class-fields-limit', 'Class Orders has 4 fields (limit 3)'],
    ]);
  });

  it('reports fields over the limit, a data class by its components, and passes classes at the limits', () => {
    const findings = readKotlinClassLimitFindings(
      metrics([
        type('Order', { kind: 'data class', fields: 11 }),
        type('Invoice', { fields: 12 }),
        type('Cart', { methods: 20, fields: 10 }),
      ]),
    );

    expect(findings.map(({ rule, message }) => [rule, message.split('.')[0]])).toEqual([
      ['class-fields-limit', 'Class Invoice has 12 fields (limit 10)'],
      ['class-fields-limit', 'Data class Order has 11 components (limit 10)'],
    ]);
  });

  it('orders the findings of a file largest first, so a ratchet compares like with like', () => {
    const findings = readKotlinClassLimitFindings(
      metrics([type('Small', { methods: 21 }), type('Large', { methods: 30 })]),
    );

    expect(findings.map(({ ratchet }) => ratchet.value)).toEqual([30, 21]);
  });

  it('drops a class under an exception of its rule and names the module path in the route', () => {
    const types = [type('Orders', { methods: 21, fields: 11 })];
    const exceptions = [{ rule: 'class-methods-limit', paths: ['shop/src/main/kotlin/**'] }];
    const findings = readKotlinClassLimitFindings(metrics(types), {
      exceptions,
      modulePath: 'shop',
    });

    expect(
      findings.map(({ rule, message }) => [
        rule,
        message.endsWith(exceptionHint(rule, `shop/${file}`)),
      ]),
    ).toEqual([['class-fields-limit', true]]);
  });

  it('counts superclasses through the project and one level for a superclass outside it', () => {
    const types = [
      type('A', { extends: 'Exception' }),
      type('B', { extends: 'A' }),
      type('C', { extends: 'B' }),
      type('D', { extends: 'C' }),
      type('E', { extends: 'Base' }),
      { ...type('Base', { extends: 'Throwable' }), file: 'src/main/kotlin/other/Base.kt' },
    ];
    const findings = readKotlinClassLimitFindings(metrics(types, ['other.Base']));

    expect(findings.map(({ rule, message }) => [rule, message.split('.')[0]])).toEqual([
      ['inheritance-depth-limit', 'Class D extends 4 classes deep (limit 3)'],
    ]);
  });

  it('survives a cycle and reads a report without types', () => {
    const cycle = [type('A', { extends: 'B' }), type('B', { extends: 'A' })];

    expect(readKotlinClassLimitFindings(metrics(cycle))).toEqual([]);
    expect(readKotlinClassLimitFindings({ functions: [], files: [] })).toEqual([]);
  });
});
