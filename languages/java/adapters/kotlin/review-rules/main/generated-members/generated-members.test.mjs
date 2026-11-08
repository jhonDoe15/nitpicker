import { describe, expect, it } from 'vitest';
import {
  file,
  fn,
  klass,
  parameter,
  property,
  routed,
  routeOf,
  run,
  summary,
} from '../../test-support/facts.mjs';
import {
  MEMBER_CYCLE_RULE,
  SKIPPED_SUPER_RULE,
  generatedMemberFindings,
} from './generated-members.mjs';

const val = (name, type, line = 1, overrides = {}) =>
  parameter(name, type, { property: 'val', line, ...overrides });
const data = (name, parameters, overrides = {}) =>
  klass(name, { data: true, primaryParameters: parameters, ...overrides });
const findingsFor = (classes, overrides = {}) =>
  run(generatedMemberFindings, [file({ classes, ...overrides })]);

describe('generated members of Kotlin data classes over a cycle', () => {
  it('reports the back reference of an order and its lines once, with the Java rule id', () => {
    const findings = findingsFor([
      data('Order', [val('id', 'String', 2), val('lines', 'List<Line>', 3)]),
      data('Line', [val('sku', 'String', 6), val('order', 'Order?', 7)]),
    ]);

    expect(summary(findings)).toEqual([`${MEMBER_CYCLE_RULE} Line.order 7`]);
    expect(findings[0].message).toBe(
      routed(
        'The generated toString, equals and hashCode of data class `Line` can follow `order` around the cycle Order.lines -> Line.order -> Order, so the first log line, HashSet or cache lookup of an object in the cycle recurses until StackOverflowError. Move the back reference out of the primary constructor into the class body (`var order: ... = null`), where the generated members do not read it. A property that only ever points down a tree, never back up, is the intended case.',
        MEMBER_CYCLE_RULE,
      ),
    );
    expect(routeOf(findings[0].message)).toBe(
      'If this is intended, add {"rule":"pmd/GeneratedMemberCycle","paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('reports a node with its parent and children on the parent', () => {
    const node = data('Node', [val('parent', 'Node?', 2), val('children', 'MutableList<Node>', 3)]);

    expect(summary(findingsFor([node]))).toEqual([`${MEMBER_CYCLE_RULE} Node.parent 2`]);
  });

  it.each([
    ['a tree of children', [val('children', 'List<Node>')]],
    ['a linked list', [val('next', 'Node?')]],
    [
      'a constructor parameter that is no property',
      [parameter('parent', 'Node?'), val('children', 'List<Node>')],
    ],
    ['a function type', [val('parent', '() -> Node'), val('children', 'List<Node>')]],
  ])('allows %s', (_name, parameters) => {
    expect(findingsFor([data('Node', parameters)])).toEqual([]);
  });

  it('allows a back reference held in the class body or by a class that is not a data class', () => {
    const order = data('Order', [val('lines', 'List<Line>')]);
    const bodyLine = data('Line', [val('sku', 'String')]);
    const plainLine = klass('Line', { primaryParameters: [val('order', 'Order')] });

    expect(
      findingsFor([order, bodyLine], {
        properties: [property('order', 'Line', { type: 'Order?', var: true })],
      }),
    ).toEqual([]);
    expect(findingsFor([order, plainLine])).toEqual([]);
  });

  it('names only the members a hand-written toString leaves generated', () => {
    const findings = findingsFor(
      [data('Order', [val('lines', 'List<Line>')]), data('Line', [val('order', 'Order', 4)])],
      { functions: [fn('toString', { owner: 'Line' })] },
    );

    expect(findings[0].message).toBe(
      routed(
        'The generated equals and hashCode of data class `Line` can follow `order` around the cycle Order.lines -> Line.order -> Order, so the first log line, HashSet or cache lookup of an object in the cycle recurses until StackOverflowError. Move the back reference out of the primary constructor into the class body (`var order: ... = null`), where the generated members do not read it. A property that only ever points down a tree, never back up, is the intended case.',
        MEMBER_CYCLE_RULE,
      ),
    );
  });

  it('resolves nested, imported and aliased classes, and skips classes it cannot resolve', () => {
    const order = file({
      file: 'src/main/kotlin/shop/orders/Order.kt',
      package: 'shop.orders',
      imports: [{ path: 'shop.items.Item', alias: 'Article', all: false }],
      classes: [data('Order', [val('items', 'Map<String, Article.Line>', 3)])],
    });
    const item = file({
      file: 'src/main/kotlin/shop/items/Item.kt',
      package: 'shop.items',
      imports: [{ path: 'shop.orders', alias: null, all: true }],
      classes: [
        klass('Item'),
        data('Line', [val('order', 'Order', 5)], { qualified: 'Item.Line' }),
      ],
    });
    const other = file({
      package: 'other',
      classes: [data('Order', [val('line', 'shop.items.Item.Line')])],
    });

    expect(summary(run(generatedMemberFindings, [order, item]))).toEqual([
      `${MEMBER_CYCLE_RULE} Item.Line.order 5`,
    ]);
    expect(run(generatedMemberFindings, [other, item])).toEqual([]);
  });

  it('reports a cycle only in the module that declares its closing property', () => {
    const order = file({ classes: [data('Order', [val('lines', 'List<Line>')])] });
    const line = file({
      file: 'src/main/kotlin/demo/Line.kt',
      classes: [data('Line', [val('order', 'Order')])],
    });
    const finding = run(generatedMemberFindings, [order], { declaredIn: [order, line] });

    expect(finding).toEqual([]);
  });
});

describe('Kotlin data classes that extend a class with state', () => {
  const base = klass('Audited', {
    open: true,
    primaryParameters: [val('createdAt', 'Instant'), parameter('source', 'String')],
  });

  it('reports a data class whose generated equals ignores inherited properties', () => {
    const findings = findingsFor(
      [base, data('Invoice', [val('total', 'Long')], { line: 4, superClass: 'Audited' })],
      { properties: [property('tenant', 'Audited', { line: 2 })] },
    );

    expect(summary(findings)).toEqual([`${SKIPPED_SUPER_RULE} Invoice 4`]);
    expect(findings[0].message).toBe(
      routed(
        'Data class `Invoice` extends `Audited`, which declares `createdAt`, `tenant`, but the generated equals and hashCode read only the primary-constructor properties of `Invoice`, so two objects that differ only in inherited properties are equal. Declare them abstract in `Audited` and override them in the primary constructor, or write equals and hashCode.',
        SKIPPED_SUPER_RULE,
      ),
    );
  });

  it.each([
    [
      'overrides every inherited property',
      [val('createdAt', 'Instant', 1, { annotations: [] }), val('total', 'Long')],
    ],
  ])('allows a data class that %s', (_name, parameters) => {
    expect(findingsFor([base, data('Invoice', parameters, { superClass: 'Audited' })])).toEqual([]);
  });

  it('allows abstract, computed and delegated properties, hand-written equals and unknown superclasses', () => {
    const stateless = klass('Shape', { open: true });
    const properties = [
      property('id', 'Shape', { abstract: true }),
      property('label', 'Shape', { computed: true }),
      property('cached', 'Shape', { delegated: true }),
    ];
    const invoice = data('Invoice', [val('total', 'Long')], { superClass: 'Audited' });

    expect(
      findingsFor([stateless, data('Square', [], { superClass: 'Shape' })], { properties }),
    ).toEqual([]);
    expect(
      findingsFor([base, invoice], {
        functions: [
          fn('equals', { owner: 'Invoice', parameters: [parameter('other', 'Any?')] }),
          fn('hashCode', { owner: 'Invoice' }),
        ],
      }),
    ).toEqual([]);
    expect(findingsFor([data('Invoice', [], { superClass: 'java.util.Date' })])).toEqual([]);
  });
});
