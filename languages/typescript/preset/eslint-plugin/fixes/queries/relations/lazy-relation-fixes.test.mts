import { typedIoProject } from '../../../test-support/projects/typed-io-project.mts';
import { ORM_PACKAGES } from '../../../test-support/projects/orm/orm-stubs.mts';
import { rule } from '../../../rules/effects/no-lazy-relation-in-loop.mts';

const STORE = [
  "import { Entity, Column, ManyToOne, OneToMany, ManyToMany } from 'typeorm';",
  '@Entity()',
  'export class Customer { @Column() name = ""; }',
  '@Entity()',
  'export class Order {',
  '  @Column() total = 0;',
  '  @ManyToOne(() => Customer, { lazy: true }) customer!: Promise<Customer>;',
  '  @ManyToOne(() => Customer) buyer!: Customer;',
  '  @OneToMany(() => Customer, (c: Customer) => c) lines!: Promise<Customer[]>;',
  '  @OneToMany(() => Customer, (c: Customer) => c, { lazy: true }) payments!: Promise<Customer[]>;',
  '  @ManyToMany(() => Customer, undefined, { lazy: true }) refunds!: Promise<Customer[]>;',
  '}',
  '@Entity()',
  'export class Basket {',
  '  @OneToMany(() => Customer, (c: Customer) => c, { eager: true }) items!: Customer[];',
  '  @OneToMany(() => Customer, (c: Customer) => c, { lazy: true }) lines!: Promise<Customer[]>;',
  '  @ManyToOne(() => Customer, { lazy: true }) owner!: Promise<Customer>;',
  '}',
].join('\n');
const HEADER = [
  "import { Repository, EntityManager } from 'typeorm';",
  "import { Order, Basket } from './store';",
  'declare const orders: Repository<Order>;',
  'declare const baskets: Repository<Basket>;',
  'declare const manager: EntityManager;',
  'declare function use(value: unknown): void;',
  'declare const where: object;',
  '',
].join('\n');

const { tester, typed } = typedIoProject('lazy-fix', STORE, {}, ORM_PACKAGES);

const code = (body: string) => `${HEADER}export async function run() { ${body} }`;
const loop = (relation: string) => `for (const order of found) { use(await order.${relation}); }`;

function fixed(body: string, output: string) {
  return {
    ...typed(code(body)),
    errors: [
      { messageId: 'lazy', suggestions: [{ messageId: 'addRelation', output: code(output) }] },
    ],
  };
}
function declined(body: string) {
  return { ...typed(code(body)), errors: [{ messageId: 'lazy' }] };
}
const customer = loop('customer');

tester.run('no-lazy-relation-in-loop suggestion', rule, {
  valid: [],
  invalid: [
    fixed(
      `const found = await orders.find(); ${customer}`,
      `const found = await orders.find({ relations: ['customer'] }); ${customer}`,
    ),
    fixed(
      `for (const order of await orders.find()) { use(await order.customer); }`,
      `for (const order of await orders.find({ relations: ['customer'] })) { use(await order.customer); }`,
    ),
    fixed(
      `const found = await orders.find({}); ${customer}`,
      `const found = await orders.find({ relations: ['customer'] }); ${customer}`,
    ),
    fixed(
      `const found = await orders.find({ where: { total: 1 } }); ${customer}`,
      `const found = await orders.find({ where: { total: 1 }, relations: ['customer'] }); ${customer}`,
    ),
    fixed(
      `const found = await orders.find({ where: { total: 1 }, take: 5 }); ${customer}`,
      `const found = await orders.find({ where: { total: 1 }, take: 5, relations: ['customer'] }); ${customer}`,
    ),
    fixed(
      `const found = await orders.find({ relations: ['buyer'] }); ${customer}`,
      `const found = await orders.find({ relations: ['buyer', 'customer'] }); ${customer}`,
    ),
    fixed(
      `const found = await orders.find({ relations: ["buyer"] }); ${customer}`,
      `const found = await orders.find({ relations: ["buyer", "customer"] }); ${customer}`,
    ),
    fixed(
      `const found = await orders.find({ relations: [] }); ${customer}`,
      `const found = await orders.find({ relations: ['customer'] }); ${customer}`,
    ),
    fixed(
      `const found = await orders.find({ relations: {} }); ${customer}`,
      `const found = await orders.find({ relations: { customer: true } }); ${customer}`,
    ),
    fixed(
      `const found = await orders.find({ relations: { buyer: true } }); ${customer}`,
      `const found = await orders.find({ relations: { buyer: true, customer: true } }); ${customer}`,
    ),
    fixed(
      `const found = await orders.find({ relations: ['buyer.address'] }); ${customer}`,
      `const found = await orders.find({ relations: ['buyer.address', 'customer'] }); ${customer}`,
    ),
    fixed(
      `const found = await manager.find(Order); ${customer}`,
      `const found = await manager.find(Order, { relations: ['customer'] }); ${customer}`,
    ),
    fixed(
      `const found = await manager.find(Order, { where }); ${customer}`,
      `const found = await manager.find(Order, { where, relations: ['customer'] }); ${customer}`,
    ),
    fixed(
      `const found = await orders.find(); ${loop('lines')}`,
      `const found = await orders.find({ relations: ['lines'] }); ${loop('lines')}`,
    ),
    fixed(
      `const found = await orders.find({ relations: ['buyer'] }); ${loop('payments')}`,
      `const found = await orders.find({ relations: ['buyer', 'payments'] }); ${loop('payments')}`,
    ),
    fixed(
      `const found = await orders.find(); ${loop('refunds')}`,
      `const found = await orders.find({ relations: ['refunds'] }); ${loop('refunds')}`,
    ),
    fixed(
      `const found = await baskets.find(); ${loop('owner')}`.replace(/order/gu, 'basket'),
      `const found = await baskets.find({ relations: ['owner'] }); ${loop('owner')}`.replace(
        /order/gu,
        'basket',
      ),
    ),
    fixed(
      `const found = await orders.find(); for (const order of found) { use(order.customer.then((c) => c.name)); }`,
      `const found = await orders.find({ relations: ['customer'] }); for (const order of found) { use(order.customer.then((c) => c.name)); }`,
    ),
    fixed(
      `const found = await orders.find(); for (const order of found) { const { customer } = order; use(await customer); }`,
      `const found = await orders.find({ relations: ['customer'] }); for (const order of found) { const { customer } = order; use(await customer); }`,
    ),
    fixed(
      `const found = await orders.find(); await Promise.all(found.map(async (order) => use(await order.customer)));`,
      `const found = await orders.find({ relations: ['customer'] }); await Promise.all(found.map(async (order) => use(await order.customer)));`,
    ),
  ],
});

tester.run('no-lazy-relation-in-loop suggestion declined', rule, {
  valid: [],
  invalid: [
    declined(`const found = await orders.findBy({ total: 1 }); ${customer}`),
    declined(`const found = await orders.createQueryBuilder('o').getMany(); ${customer}`),
    declined(`const found = await orders.find({ select: { total: true } }); ${customer}`),
    declined(`const found = await orders.find({ join: { alias: 'o' } }); ${customer}`),
    declined(`const found = await orders.find({ loadRelationIds: true }); ${customer}`),
    declined(`const found = await orders.find({ relationLoadStrategy: 'query' }); ${customer}`),
    declined(`const found = await orders.find({ /* all */ }); ${customer}`),
    declined(`const found = await orders.find({ relations: [/* none */] }); ${customer}`),
    declined(`const found = await orders.find({ relations: ['lines'] }); ${loop('payments')}`),
    declined(`const found = await orders.find({ relations: { lines: true } }); ${loop('refunds')}`),
    declined(`const found = await orders.find({ relations: ['buyer.address'] }); ${loop('lines')}`),
    declined(`const found = await orders.find({ relations: ['unknown'] }); ${loop('lines')}`),
    declined(`const found = await baskets.find(); ${loop('lines')}`.replace(/order/gu, 'basket')),
    declined(`const found = await orders.find({ where }, 1 as never); ${customer}`),
  ],
});
