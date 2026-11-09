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
afterAll(() => {
  for (const root of [postgres, migrated, mysql, sqlite]) {
    rmSync(root, { recursive: true, force: true });
  }
});

const TYPEORM =
  "import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryColumn, Unique } from 'typeorm';\n";
const MIKRO =
  "import { Entity, Index, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/core';\n";
const DRIZZLE = [
  "import { index, integer, pgTable, primaryKey, foreignKey, uniqueIndex } from 'drizzle-orm/pg-core';",
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
  return at(root, code, [{ messageId, data: { property } }]);
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
    at(migrated, ORDER),
    at(migrated, LINES),
    at(mysql, ORDER),
    at(sqlite, BOOK),
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
    flagged('MikroORM', 'author', BOOK),
    flagged(
      'MikroORM',
      'author',
      `${MIKRO}@Entity() @Index({ properties: ['title', 'author'] }) class Book { @ManyToOne(() => Author) author!: Author; }`,
    ),
    flagged('Drizzle', 'orderId', LINES),
    flagged(
      'Drizzle',
      'orderId',
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id').references(() => orders.id), id: integer('id') }, (t) => [index().on(t.id, t.orderId)]);`,
    ),
    flagged(
      'Drizzle',
      'orderId, shopId',
      `${DRIZZLE}export const lines = pgTable('lines', { orderId: integer('order_id'), shopId: integer('shop_id') }, (t) => [foreignKey({ columns: [t.orderId, t.shopId], foreignColumns: [orders.id, orders.shopId] }), index().on(t.shopId)]);`,
    ),
  ],
});
