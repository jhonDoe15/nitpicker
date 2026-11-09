import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-unindexed-foreign-key.mjs';
import { schemaProject } from './test-support/schema-projects.mjs';

function manifest(dependencies) {
  return JSON.stringify({
    dependencies: Object.fromEntries(dependencies.map((name) => [name, '1.0.0'])),
  });
}

const POSTGRES = ['typeorm', 'pg', '@mikro-orm/core', '@mikro-orm/postgresql', 'drizzle-orm'];
const postgres = schemaProject({ 'package.json': manifest(POSTGRES) });
const migrated = schemaProject({
  'package.json': manifest(POSTGRES),
  'src/migrations/1700000000000-Init.ts': 'export class Init1700000000000 {}\n',
});
const mysql = schemaProject({ 'package.json': manifest(['typeorm', 'mysql2']) });
const sqlite = schemaProject({
  'package.json': manifest(['@mikro-orm/core', '@mikro-orm/sqlite']),
});
const mssql = schemaProject({ 'package.json': manifest(['@mikro-orm/core', '@mikro-orm/mssql']) });
const monorepo = schemaProject({
  'package.json': manifest(['mysql2']),
  'packages/db/package.json': manifest(['typeorm']),
  'packages/billing/migrations/1_init.sql': 'create table invoices (id int);\n',
});
afterAll(() => {
  for (const root of [postgres, migrated, mysql, sqlite, mssql, monorepo]) {
    rmSync(root, { recursive: true, force: true });
  }
});

const TYPEORM =
  "import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryColumn, Unique, ViewEntity } from 'typeorm';\n";
const MIKRO =
  "import { Entity, Index, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/core';\n";
const DRIZZLE = [
  "import { index, integer, pgTable, primaryKey, foreignKey, uniqueIndex, unique, pgSchema, pgTableCreator } from 'drizzle-orm/pg-core';",
  "import * as pg from 'drizzle-orm/pg-core';",
  "import { mysqlTable } from 'drizzle-orm/mysql-core';",
  '',
].join('\n');

function at(root, code, errors) {
  return {
    code,
    filename: path.join(root, 'src/order.ts'),
    ...(errors === undefined ? {} : { errors }),
  };
}

function flagged(messageId, property, code, root = postgres) {
  return at(root, code, [{ messageId, data: { property, columns: '' } }]);
}

function drizzle(property, code) {
  const columns = property
    .split(', ')
    .map((column) => `table.${column}`)
    .join(', ');
  return at(postgres, code, [{ messageId: 'Drizzle', data: { property, columns } }]);
}

const ORDER = `${TYPEORM}@Entity() class Order { @ManyToOne(() => Customer) customer: Customer; }`;
const BOOK = `${MIKRO}@Entity() class Book { @ManyToOne(() => Author) author!: Author; }`;
const LINES = `${DRIZZLE}export const lines = pgTable('lines', { id: integer('id').primaryKey(), orderId: integer('order_id').references(() => orders.id) });`;

const tester = typescriptRuleTester();

tester.run('no-unindexed-foreign-key', rule, {
  valid: [
    at(
      postgres,
      `${TYPEORM}@Entity() class Order { @Index() @ManyToOne(() => Customer) customer: Customer; }`,
    ),
    at(
      postgres,
      `${TYPEORM}@Entity() @Index(['customer', 'createdAt']) class Order { @ManyToOne(() => Customer) customer: Customer; }`,
    ),
    at(
      postgres,
      `${TYPEORM}@Entity() @Index('by_customer', (order) => [order.customer]) class Order { @ManyToOne(() => Customer) customer: Customer; }`,
    ),
    at(
      postgres,
      `${TYPEORM}@Entity() @Unique(['customerId', 'number']) class Order { @ManyToOne(() => Customer) customer: Customer; }`,
    ),
    at(
      postgres,
      `${TYPEORM}@Entity() class Order { @ManyToOne(() => Customer) @JoinColumn({ name: 'customer_id' }) customer: Customer; @Index() @Column({ name: 'customer_id' }) customerKey: number; }`,
    ),
    at(
      postgres,
      `${TYPEORM}@Entity() class Line { @PrimaryColumn() orderId: number; @ManyToOne(() => Order) order: Order; }`,
    ),
    at(
      postgres,
      `${TYPEORM}@Entity() class Order { @ManyToOne(() => Customer, { createForeignKeyConstraints: false }) customer: Customer; }`,
    ),
    at(
      postgres,
      `${TYPEORM}@Entity() class Profile { @OneToOne(() => User) @JoinColumn() user: User; }`,
    ),
    at(
      postgres,
      `${MIKRO}@Entity() class Book { @ManyToOne(() => Author, { index: true }) author!: Author; }`,
    ),
    at(
      postgres,
      `${MIKRO}@Entity() class Book { @ManyToOne({ entity: () => Author, index: 'book_author' }) author!: Author; }`,
    ),
    at(
      postgres,
      `${MIKRO}@Entity() @Index({ properties: ['author', 'title'] }) class Book { @ManyToOne(() => Author) author!: Author; }`,
    ),
    at(
      postgres,
      `${MIKRO}@Entity() @Unique({ properties: 'author' }) class Book { @ManyToOne(() => Author) author!: Author; }`,
    ),
    at(
      postgres,
      `${MIKRO}@Entity() class Book { @PrimaryKey() @ManyToOne(() => Author) author!: Author; }`,
    ),
    at(
      postgres,
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id').references(() => orders.id) }, (table) => [index('lines_order').on(table.orderId, table.id)]);`,
    ),
    at(
      postgres,
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id').references(() => orders.id) }, (t) => ({ byOrder: uniqueIndex().on(t.orderId) }));`,
    ),
    at(
      postgres,
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id').references(() => orders.id), position: integer('position') }, (t) => [primaryKey({ columns: [t.orderId, t.position] })]);`,
    ),
    at(
      postgres,
      `${DRIZZLE}export const lines = mysqlTable('lines', { orderId: integer('order_id').references(() => orders.id) });`,
    ),
    at(
      postgres,
      'class Order { @ManyToOne(() => Customer) customer; }\nfunction ManyToOne() { return () => undefined; }',
    ),
    at(
      postgres,
      `${TYPEORM}@Entity() class Order { @ManyToOne(() => Customer) customer: Customer; @Column({ unique: true }) customerId: number; }`,
    ),
    at(
      postgres,
      `${TYPEORM}@Entity() @Index(['customer_id']) class Order { @ManyToOne(() => Customer) @JoinColumn({ name: 'customer_id' }) customer: Customer; }`,
    ),
    at(
      postgres,
      `${TYPEORM}@ViewEntity() class OrderView { @ManyToOne(() => Customer) customer: Customer; }`,
    ),
    at(
      postgres,
      `${MIKRO}@Entity() class Book { @Index() @ManyToOne(() => Author) author!: Author; }`,
    ),
    at(
      postgres,
      `${MIKRO}@Entity() class Book { @Unique() @ManyToOne(() => Author) author!: Author; }`,
    ),
    at(
      postgres,
      `${MIKRO}@Entity() class Book { @ManyToOne(() => Author, { unique: true }) author!: Author; }`,
    ),
    at(
      postgres,
      `${MIKRO}@Entity() class Book { @ManyToOne(() => Author, { createForeignKeyConstraint: false }) author!: Author; }`,
    ),
    at(
      postgres,
      `${MIKRO}@Entity() class Book { @ManyToOne(() => Author, { persist: false }) author!: Author; }`,
    ),
    at(
      postgres,
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id').references(() => orders.id).unique() });`,
    ),
    at(
      postgres,
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id').references(() => orders.id) }, (t) => [unique().on(t.orderId)]);`,
    ),
    at(
      postgres,
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id') }, (t) => [foreignKey({ columns: [t.orderId], foreignColumns: [orders.id] }), index().on(t.orderId)]);`,
    ),
    at(
      postgres,
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id').references(() => orders.id) }, (t) => { return [index().on(t.orderId.asc())]; });`,
    ),
    at(
      postgres,
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id').references(() => orders.id) }, ({ orderId }) => [index().using('btree', orderId.desc())]);`,
    ),
    at(
      postgres,
      `${MIKRO}import { EntitySchema } from '@mikro-orm/core';\nexport const Book = new EntitySchema({ name: 'Book', properties: { author: { kind: 'm:1', entity: 'Author' } } });`,
    ),
    at(migrated, ORDER),
    at(migrated, LINES),
    at(mysql, ORDER),
    at(sqlite, BOOK),
    at(mysql, LINES),
    at(path.join(monorepo, 'packages/db'), ORDER),
  ],
  invalid: [
    flagged('TypeORM', 'customer', ORDER),
    flagged(
      'TypeORM',
      'customer',
      `${TYPEORM}@Entity() @Index(['createdAt', 'customer']) class Order { @ManyToOne(() => Customer) customer: Customer; }`,
    ),
    flagged(
      'TypeORM',
      'customer',
      `${TYPEORM}@Entity() class Order { @ManyToOne(() => Customer) @JoinColumn({ name: 'customer_id' }) customer: Customer; @Column() customerId: number; }`,
    ),
    flagged(
      'TypeORM',
      'customer',
      `${TYPEORM}@Entity() class Order { @PrimaryColumn() number: number; @PrimaryColumn() customerId: number; @ManyToOne(() => Customer) customer: Customer; }`,
    ),
    flagged(
      'TypeORM',
      'customer',
      `${TYPEORM}@Entity() @Index(['customer'], { where: '"archived" = false' }) class Order { @ManyToOne(() => Customer) customer: Customer; }`,
    ),
    flagged(
      'TypeORM',
      'customer',
      `${TYPEORM}export const Order = @Entity() class { @ManyToOne(() => Customer) customer: Customer; };`,
    ),
    flagged('MikroORM', 'author', BOOK),
    flagged('MikroORM', 'author', BOOK, mssql),
    flagged(
      'MikroORM',
      'shelf',
      `${MIKRO}@Entity() class Placement { @ManyToOne(() => Book, { primary: true }) book!: Book; @ManyToOne(() => Shelf, { primary: true }) shelf!: Shelf; }`,
    ),
    flagged(
      'MikroORM',
      'author',
      `${MIKRO}@Entity() @Index({ properties: ['title', 'author'] }) class Book { @ManyToOne(() => Author) author!: Author; }`,
    ),
    drizzle('orderId', LINES),
    drizzle(
      'orderId',
      `${DRIZZLE}export const lines = pgTable('lines', (c) => ({ orderId: c.integer('order_id').references(() => orders.id) }));`,
    ),
    drizzle(
      'orderId',
      `${DRIZZLE}export const lines = pg.pgTable('lines', { orderId: integer('order_id').references(() => orders.id) });`,
    ),
    drizzle(
      'orderId',
      `${DRIZZLE}const shop = pgSchema('shop');\nexport const lines = shop.table('lines', { orderId: integer('order_id').references(() => orders.id) });`,
    ),
    drizzle(
      'orderId',
      `${DRIZZLE}const table = pgTableCreator((name) => \`shop_\${name}\`);\nexport const lines = table('lines', { orderId: integer('order_id').references(() => orders.id) });`,
    ),
    drizzle(
      'orderId',
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id').references(() => orders.id) }, (t) => [index().on(t.orderId).where(sql\`true\`)]);`,
    ),
    drizzle(
      'orderId',
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id').references(() => orders.id), id: integer('id') }, (t) => [index().on(t.id, t.orderId)]);`,
    ),
    drizzle(
      'orderId, shopId',
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id'), shopId: integer('shop_id') }, (t) => [foreignKey({ columns: [t.orderId, t.shopId], foreignColumns: [orders.id, orders.shopId] }), index().on(t.shopId)]);`,
    ),
  ],
});
