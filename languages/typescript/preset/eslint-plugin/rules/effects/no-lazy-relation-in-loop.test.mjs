import { typedIoProject } from '../../test-support/typed-io-project.mjs';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-lazy-relation-in-loop.mjs';

const ENTITIES = [
  "import { Entity, Column, ManyToOne, OneToMany } from 'typeorm';",
  '@Entity()',
  'export class Customer {',
  '  @Column() name = "";',
  '}',
  '@Entity()',
  'export class Order {',
  '  @Column() total = 0;',
  '  @ManyToOne(() => Customer, { lazy: true }) customer!: Promise<Customer>;',
  '  @ManyToOne(() => Customer) buyer!: Customer;',
  '  @OneToMany(() => Customer, (customer: Customer) => customer) lines!: Promise<Customer[]>;',
  '}',
].join('\n');

const SCHEMAS = [
  "import { EntitySchema, Repository } from 'typeorm';",
  'export interface Invoice { id: number; payer: Promise<object>; owner: Promise<object> }',
  'export const InvoiceSchema = new EntitySchema<Invoice>({',
  "  name: 'Invoice',",
  "  relations: { payer: { type: 'many-to-one', lazy: true }, owner: { type: 'many-to-one' } },",
  '});',
  'export declare const shipments: Repository<any>;',
].join('\n');

const SCRIPT_SCHEMA = [
  "const { EntitySchema } = require('typeorm');",
  "module.exports = new EntitySchema({ name: 'Shipment', relations: { carrier: { lazy: true } } });",
].join('\n');

const { tester, typed, typedScript } = typedIoProject('lazy-relation', ENTITIES, {
  'schemas.ts': SCHEMAS,
  'shipment.cjs': SCRIPT_SCHEMA,
});

const HEADER = [
  "import { Repository, EntityManager } from 'typeorm';",
  "import { Order } from './store';",
  "import type { Invoice } from './schemas';",
  'declare const orders: Repository<Order>;',
  'declare const invoices: Repository<Invoice>;',
  'declare const manager: EntityManager;',
  'declare function use(value: unknown): void;',
  'declare const loaded: Order[];',
  'declare const base: object;',
  '',
].join('\n');

function inRun(body) {
  return `${HEADER}export async function run() { ${body} }`;
}

function invalid(body, data) {
  return { ...typed(inRun(body)), errors: [{ messageId: 'lazy', ...(data ? { data } : {}) }] };
}

const loop = 'for (const order of found) { use(await order.customer); }';

tester.run('no-lazy-relation-in-loop', rule, {
  valid: [
    `const found = await orders.find({ relations: ['customer'] }); ${loop}`,
    `const found = await orders.find({ relations: { customer: true } }); ${loop}`,
    `const found = await orders.find({ relations: ['customer.address'] }); ${loop}`,
    `const found = await orders.find(base); ${loop}`,
    `const found = await orders.find({ ...base }); ${loop}`,
    `const found = await orders.createQueryBuilder('o').leftJoinAndSelect('o.customer', 'c').getMany(); ${loop}`,
    `const found = loaded; ${loop}`,
    'for (const order of loaded) { use(await order.customer); }',
    'const found = await orders.find(); for (const order of found) { use(order.buyer); }',
    'const found = await orders.find(); for (const order of found) { use(order.total); }',
    'const found = await orders.find(); const first = found[0]; use(await first.customer);',
    'const found = await orders.find(); for (const order of found) { const other = found[0]; use(await other.customer); }',
    `const found = await manager.find(Order, { relations: ['customer'] }); ${loop}`,
    'for (const invoice of await invoices.find()) { use(await invoice.owner); }',
  ].map((body) => typed(inRun(body))),
  invalid: [
    invalid(`const found = await orders.find(); ${loop}`, {
      entity: 'Order',
      relation: 'customer',
      origin: 'orders.find()',
    }),
    invalid(`const found = await orders.find({ where: { total: 1 } }); ${loop}`),
    invalid(`const found = await orders.find({ relations: ['lines'] }); ${loop}`),
    invalid(`const found = await orders.findBy({ total: 1 }); ${loop}`),
    invalid(
      `const found = await orders.createQueryBuilder('o').where('o.total > 0').getMany(); ${loop}`,
    ),
    invalid('for (const order of await orders.find()) { use(await order.customer); }'),
    invalid(
      'const found = await orders.find(); await Promise.all(found.map(async (order) => use(await order.lines)));',
    ),
    invalid(`const found = await manager.find(Order); ${loop}`, {
      entity: 'Order',
      relation: 'customer',
      origin: 'manager.find()',
    }),
    invalid('for (const invoice of await invoices.find()) { use(await invoice.payer); }', {
      entity: 'Invoice',
      relation: 'payer',
      origin: 'invoices.find()',
    }),
    {
      ...typedScript(
        "import { shipments } from './schemas';\nexport async function run() { for (const shipment of await shipments.find()) { await shipment.carrier; } }",
      ),
      errors: [
        {
          messageId: 'lazy',
          data: { entity: 'Shipment', relation: 'carrier', origin: 'shipments.find()' },
        },
      ],
    },
  ],
});

typescriptRuleTester().run('no-lazy-relation-in-loop without types', rule, {
  valid: [{ code: inRun(`const found = await orders.find(); ${loop}`) }],
  invalid: [],
});
