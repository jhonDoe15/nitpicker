import { typedIoProject } from '../../../test-support/projects/typed-io-project.mts';
import { rule } from './no-loaded-rows-saved-back.mts';

const STORE = [
  "import { Entity, Column, Model, OneToMany } from 'typeorm';",
  'declare function BeforeUpdate(): MethodDecorator;',
  'declare function VersionColumn(): PropertyDecorator;',
  'declare function EventSubscriber(): ClassDecorator;',
  '@Entity() export class Order { @Column() status = ""; @Column() total = 0; get label() { return this.status; } }',
  '@Entity() export class Audited { @Column() status = ""; @BeforeUpdate() touch() {} }',
  '@Entity() export class Versioned { @Column() status = ""; @VersionColumn() version = 0; }',
  '@Entity() export class Watched { @Column() status = ""; }',
  '@EventSubscriber() export class WatchedSubscriber { listenTo() { return Watched; } beforeUpdate() {} }',
  '@Entity() export class Parent { @Column() status = ""; @OneToMany(() => Order, (order: Order) => order, { cascade: true }) items!: Order[]; }',
  'export declare class MikroManager {',
  '  find<T>(entity: new () => T, where?: object): Promise<T[]>;',
  '  flush(): Promise<void>;',
  '  removeAndFlush(entity: unknown): Promise<void>;',
  '  nativeUpdate(entity: unknown, where: object, data: object): Promise<number>;',
  '}',
].join('\n');

const { tester, typed } = typedIoProject('rows-saved-back', STORE, {
  'sequelize-store.ts':
    "import { Model } from 'sequelize';\nexport class Account extends Model { declare status: string; static findAll(options?: object): Promise<Account[]> { return Promise.resolve([]); } }",
});

const HEADER = [
  "import { Repository } from 'typeorm';",
  "import type { EntityManager as Unused } from '@mikro-orm/core';",
  "import { PrismaClient } from '@prisma/client';",
  "import { Account } from './sequelize-store';",
  "import { Order, Audited, Versioned, Watched, Parent, MikroManager } from './store';",
  'declare const orderRepo: Repository<Order>;',
  'declare const auditedRepo: Repository<Audited>;',
  'declare const versionedRepo: Repository<Versioned>;',
  'declare const watchedRepo: Repository<Watched>;',
  'declare const looseRepo: Repository<any>;',
  'declare const parentRepo: Repository<Parent>;',
  'declare const tokenRepo: Repository<Order>;',
  'declare const em: MikroManager;',
  'declare const prisma: PrismaClient;',
  'declare const cutoff: Date;',
  'declare const bus: { emit(name: string): void };',
  'declare function nextStatus(order: Order): string;',
  '',
].join('\n');

const inRun = (body) => typed(`${HEADER}export async function run() { ${body} }`);
const bad = (body, messageId) => ({ ...inRun(body), errors: [{ messageId }] });

const LOAD = 'const stale = await orderRepo.find({ where: { status: "pending" } });';

tester.run('no-loaded-rows-saved-back', rule, {
  valid: [
    'const rows = await parentRepo.find(); await parentRepo.remove(rows);',
    'const rows = await parentRepo.find(); for (const row of rows) { row.status = "x"; } await parentRepo.save(rows);',
    'const rows = await orderRepo.find(); await tokenRepo.delete(rows.map((row) => row.status));',
    'const rows = await prisma.order.findMany({ where: { id: "a" } }); await prisma.user.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });',
    `${LOAD} for (const order of stale) { order.status = nextStatus(order); } await orderRepo.save(stale);`,
    `${LOAD} for (const order of stale) { order.total = order.total + 1; } await orderRepo.save(stale);`,
    `${LOAD} for (const order of stale) { order.status = "expired"; bus.emit("expired"); } await orderRepo.save(stale);`,
    `${LOAD} for (const order of stale) { order.status += "x"; } await orderRepo.save(stale);`,
    `${LOAD} stale.forEach((order) => { order.status = nextStatus(order); }); await orderRepo.save(stale);`,
    `${LOAD} for (const order of stale) { order.status = "expired"; } await orderRepo.save(stale); return stale;`,
    `${LOAD} for (const order of stale) { order.status = "expired"; await orderRepo.save(order); }`,
    `${LOAD} for (const order of stale) { order.status = "expired"; }`,
    `const stale = await orderRepo.find({ take: 10 }); for (const order of stale) { order.status = "expired"; } await orderRepo.save(stale);`,
    'const stale = await auditedRepo.find(); for (const row of stale) { row.status = "expired"; } await auditedRepo.save(stale);',
    'const stale = await versionedRepo.find(); for (const row of stale) { row.status = "expired"; } await versionedRepo.save(stale);',
    'const stale = await watchedRepo.find(); for (const row of stale) { row.status = "expired"; } await watchedRepo.save(stale);',
    'const stale = await looseRepo.find(); for (const row of stale) { row.status = "expired"; } await looseRepo.save(stale);',
    'const stale = await auditedRepo.find(); await auditedRepo.remove(stale);',
    'const stale = await watchedRepo.find(); await watchedRepo.delete(stale.map((row) => row.status));',
    'const stale = await auditedRepo.find(); await auditedRepo.delete(stale.map((row) => row.status));',
    `${LOAD} await orderRepo.remove(stale); return stale.length;`,
    `${LOAD} await orderRepo.delete(stale.map((order) => ({ id: order.status, label: order.total })));`,
    `${LOAD} await orderRepo.delete(stale.map((order) => order.status.trim()));`,
    'const rows = await orderRepo.find({ select: { status: true } }); await orderRepo.delete(rows.map((row) => row.status));',
    'const rows = await prisma.order.findMany({ select: { id: true } }); await prisma.order.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });',
    'const rows = await em.find(Order, {}); for (const row of rows) { row.status = nextStatus(row); } await em.flush();',
    'const rows = await em.find(Audited, {}); for (const row of rows) { row.status = "x"; } await em.flush();',
    'const rows = await em.find(Order, {}); for (const row of rows) { row.status = "x"; }',
    'const rows = await Account.findAll(); for (const row of rows) { row.status = row.status.trim(); } await Account.bulkCreate(rows, { updateOnDuplicate: ["status"] });',
    'const rows = await Account.findAll(); for (const row of rows) { row.status = "x"; } await Account.bulkCreate(rows);',
    'const rows = await prisma.order.findMany({ where: { id: { in: [] } } }); await prisma.order.deleteMany({ where: { id: { in: [...rows] } } });',
  ].map(inRun),
  invalid: [
    bad(
      `${LOAD} for (const order of stale) { order.status = "expired"; } await orderRepo.save(stale);`,
      'update',
    ),
    bad(
      `${LOAD} for (const order of stale) order.status = "expired"; await orderRepo.save(stale);`,
      'update',
    ),
    bad(
      `${LOAD} for (const order of stale) { order.status = "expired"; order.total = 0; } await orderRepo.save(stale);`,
      'update',
    ),
    bad(
      `${LOAD} for (const order of stale) { order.status = "expired"; order.total = 0; } await orderRepo.save(stale, { chunk: 50 });`,
      'update',
    ),
    bad(
      `${LOAD} stale.forEach((order) => { order.status = "expired"; }); await orderRepo.save(stale);`,
      'update',
    ),
    bad(
      `${LOAD} stale.forEach((order) => (order.status = "expired")); await orderRepo.save(stale);`,
      'update',
    ),
    bad(
      `${LOAD} for (const order of stale) { order.status = "expired"; order.total = Date.now(); } await orderRepo.save(stale);`,
      'update',
    ),
    bad(
      'const stale = await orderRepo.findBy({ status: "pending" }); for (const order of stale) { order.status = "expired"; } await orderRepo.save(stale);',
      'update',
    ),
    bad(
      'const stale = await orderRepo.createQueryBuilder("o").where("o.total > 1").getMany(); for (const order of stale) { order.status = "expired"; } await orderRepo.save(stale);',
      'update',
    ),
    bad(
      'const stale = await Account.findAll({ where: { status: "pending" } }); for (const row of stale) { row.status = "expired"; } await Account.bulkCreate(stale, { updateOnDuplicate: ["status"] });',
      'update',
    ),
    bad(
      'const stale = await em.find(Order, { status: "pending" }); for (const order of stale) { order.status = "expired"; } await em.flush();',
      'update',
    ),
    bad(
      'const stale = await em.find(Order, { status: "pending" }); stale.forEach((order) => { order.status = "expired"; }); await em.flush();',
      'update',
    ),
    bad(`${LOAD} await orderRepo.remove(stale);`, 'delete'),
    bad(`${LOAD} await orderRepo.softRemove(stale);`, 'delete'),
    bad('const stale = await em.find(Order, {}); await em.removeAndFlush(stale);', 'delete'),
    bad(`${LOAD} await orderRepo.delete(stale.map((order) => order.status));`, 'delete'),
    bad(
      `${LOAD} const ids = stale.map((order) => order.status); await orderRepo.delete(ids);`,
      'delete',
    ),
    bad(
      `${LOAD} await orderRepo.update(stale.map(({ status }) => status), { total: 0 });`,
      'update',
    ),
    bad(
      'const rows = await prisma.order.findMany({ where: { id: { in: [] } } }); await prisma.order.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });',
      'delete',
    ),
    bad(
      'const rows = await prisma.order.findMany({ where: { id: { in: [] } } }); const ids = rows.map((row) => row.id); await prisma.order.updateMany({ where: { id: { in: ids } }, data: { id: "x" } });',
      'update',
    ),
    bad(
      'const rows = await Account.findAll({ where: { status: "old" } }); await Account.destroy({ where: { status: rows.map((row) => row.status) } });',
      'delete',
    ),
  ],
});

const drizzle = (body) =>
  typed(
    `import { eq, inArray } from "drizzle-orm";\nexport async function run(db, orders) { ${body} }`,
  );

tester.run('no-loaded-rows-saved-back with drizzle', rule, {
  valid: [
    drizzle(
      'const rows = await db.select().from(orders); await db.delete(tokens).where(inArray(tokens.id, rows.map((row) => row.id)));',
    ),
    drizzle(
      'const rows = await db.select({ id: orders.id }).from(orders); await db.delete(orders).where(inArray(orders.id, rows.map((row) => row.id)));',
    ),
    drizzle(
      'const rows = await db.select().from(orders); await db.insert(orders).values(rows.map((row) => row.id));',
    ),
    drizzle(
      'const rows = await db.select().from(orders); await db.delete(orders).where(inArray(orders.id, rows.map((row) => row.id)));\nreturn rows;',
    ),
  ],
  invalid: [
    {
      ...drizzle(
        'const rows = await db.select().from(orders).where(eq(orders.status, "old")); await db.delete(orders).where(inArray(orders.id, rows.map((row) => row.id)));',
      ),
      errors: [{ messageId: 'delete' }],
    },
    {
      ...drizzle(
        'const rows = await db.select().from(orders).where(eq(orders.status, "old")); await db.update(orders).set({ status: "x" }).where(inArray(orders.id, rows.map((row) => row.id)));',
      ),
      errors: [{ messageId: 'update' }],
    },
  ],
});
