import { describe, expect, it } from 'vitest';
import { findingFactory } from '../../../review-finding.mjs';
import { file, klass, parameter } from '../../../test-support/facts.mjs';
import { springFindings } from '../../spring-findings.mjs';
import { FOREIGN_KEY_RULES } from './foreign-keys.mjs';

const JPA = { path: 'jakarta.persistence', all: true };

function entry(name, args = {}) {
  return {
    name,
    type: name,
    arguments: Object.entries(args).map(([key, text]) =>
      key === '' ? { text } : { name: key, text },
    ),
  };
}

function column(name, line, entries) {
  return parameter(name, 'Customer?', {
    property: 'var',
    line,
    annotationEntries: [entry('ManyToOne'), ...entries],
  });
}

function entity(name, { table, columns, ...rest }) {
  return klass(name, {
    annotations: [entry('Entity'), ...(table === undefined ? [] : [entry('Table', table)])],
    primaryParameters: columns,
    ...rest,
  });
}

function sourceOf(classes, overrides = {}) {
  return file({
    imports: [JPA],
    classes,
    scopes: [],
    invocations: [],
    locals: [],
    catches: [],
    literals: [],
    nullReturns: [],
    exceptionUses: [],
    throws: [],
    ...overrides,
  });
}

function reported(files, { checksForeignKeys = () => true } = {}) {
  return springFindings(files, {
    finding: findingFactory(),
    manifest: { spring: true },
    projectFiles: files,
    projectRoot: '/nonexistent',
    javaRoots: [],
    foreignKeys: checksForeignKeys,
    rules: FOREIGN_KEY_RULES,
  }).map(({ symbol, location }) => `${symbol}:${String(location.line)}`);
}

describe('JpaUnindexedForeignKey in Kotlin entities', () => {
  it('reports a @ManyToOne no index or unique constraint leads with', () => {
    const order = entity('Order', {
      table: {
        indexes:
          '[Index(columnList = "customer_id, placed_at"), Index(name = "x", columnList = "billing")]',
        uniqueConstraints: '[UniqueConstraint(columnNames = ["shipping_address_id", "id"])]',
      },
      columns: [
        column('customer', 2, []),
        column('billingCustomer', 3, [entry('JoinColumn', { name: '"billing"' })]),
        column('shippingAddress', 4, []),
        column('seller', 5, []),
        column('agent', 6, [entry('JoinColumn', { name: '"agent_ref"' })]),
        column('owner', 7, [entry('JoinColumn', { unique: 'true' })]),
        column('constant', 8, [entry('JoinColumn', { name: 'Names.COLUMN' })]),
        column('composite', 9, [entry('JoinColumns', { '': '[JoinColumn(name = "placed_at")]' })]),
        column('maps', 10, [entry('MapsId')]),
      ],
    });

    expect(reported([sourceOf([order])])).toEqual([
      'Order.seller:5',
      'Order.agent:6',
      'Order.composite:9',
    ]);
  });

  it('takes the default join column as the field name and the referenced column, not any prefix', () => {
    const order = entity('Order', {
      table: {
        indexes:
          '[Index(columnList = "user_name"), Index(columnList = "buyer_code"), Index(columnList = "a_id")]',
      },
      columns: [
        column('user', 2, []),
        column('buyer', 3, [entry('JoinColumn', { referencedColumnName: '"code"' })]),
        column('secondary', 4, [entry('JoinColumn', { table: '"order_extra"' })]),
        column('loose', 5, [
          entry('JoinColumn', { foreignKey: 'ForeignKey(ConstraintMode.NO_CONSTRAINT)' }),
        ]),
        column('nested', 6, [
          entry('JoinColumns', {
            '': '[JoinColumn(foreignKey = ForeignKey(name = "fk_x"), name = "a_id")]',
          }),
        ]),
      ],
    });

    expect(reported([sourceOf([order])])).toEqual(['Order.user:2']);
  });

  it('counts the alphabetically first @Id as the primary key index of a composite key', () => {
    const line = entity('Line', {
      columns: [column('order', 2, [entry('Id')]), column('product', 3, [entry('Id')])],
    });

    expect(reported([sourceOf([line])])).toEqual(['Line.product:3']);
  });

  it('leaves an entity alone when an index list is not plain text', () => {
    const order = entity('Order', {
      table: { indexes: 'INDEXES' },
      columns: [column('customer', 2, [])],
    });
    const templated = entity('Invoice', {
      table: { indexes: '[Index(columnList = "$PREFIX")]' },
      columns: [column('customer', 2, [])],
    });
    const raw = entity('Receipt', {
      table: { indexes: '[Index(columnList = """customer_id""")]' },
      columns: [column('customer', 2, [])],
    });

    expect(reported([sourceOf([order, templated, raw])])).toEqual([]);
  });

  it('leaves a single-table subclass to the root table and checks a joined one', () => {
    const root = entity('Payment', { columns: [] });
    const card = entity('CardPayment', {
      superClass: 'Payment',
      columns: [column('customer', 2, [])],
    });
    const joined = klass('Account', {
      annotations: [entry('Entity'), entry('Inheritance', { strategy: 'InheritanceType.JOINED' })],
    });
    const savings = entity('Savings', {
      superClass: 'Account',
      columns: [column('customer', 3, [])],
    });

    expect(reported([sourceOf([root, card, joined, savings])])).toEqual(['Savings.customer:3']);
  });

  it('follows the hierarchy past a mapped superclass to the root entity and its strategy', () => {
    const mapped = (name, superClass) =>
      klass(name, { annotations: [entry('MappedSuperclass')], superClass });
    const root = entity('Base', { columns: [] });
    const order = entity('Order', { superClass: 'Middle', columns: [column('customer', 2, [])] });
    const joinedRoot = klass('Root', {
      annotations: [entry('Entity'), entry('Inheritance', { strategy: 'InheritanceType.JOINED' })],
    });
    const middle = entity('Step', { superClass: 'Root', columns: [] });
    const invoice = entity('Invoice', { superClass: 'Step', columns: [column('customer', 3, [])] });

    expect(reported([sourceOf([root, mapped('Middle', 'Base'), order])])).toEqual([]);
    expect(reported([sourceOf([joinedRoot, middle, invoice])])).toEqual(['Invoice.customer:3']);
  });

  it('is quiet where the project gate says the database indexes keys itself or migrations own them', () => {
    const order = entity('Order', { columns: [column('customer', 2, [])] });

    expect(reported([sourceOf([order])], { checksForeignKeys: () => false })).toEqual([]);
    expect(reported([sourceOf([order])], { checksForeignKeys: () => true })).toEqual([
      'Order.customer:2',
    ]);
  });

  it('ignores a @ManyToOne in a mapped superclass and a class that is not an entity', () => {
    const base = klass('Base', {
      annotations: [entry('MappedSuperclass')],
      primaryParameters: [column('customer', 2, [])],
    });

    expect(reported([sourceOf([base])])).toEqual([]);
  });
});
