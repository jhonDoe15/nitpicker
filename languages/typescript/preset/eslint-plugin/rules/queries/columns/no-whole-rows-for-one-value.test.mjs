import { typedIoProject } from '../../../test-support/projects/typed-io-project.mts';
import { rule } from './no-whole-rows-for-one-value.mjs';

const STORE = [
  "import { Entity, Column } from 'typeorm';",
  '@Entity() export class Order {',
  '  @Column() status = "";',
  '  @Column() total = 0;',
  '  get label() { return this.status; }',
  '  describe() { return this.status; }',
  '}',
  'export declare class MikroManager {',
  '  find<T>(entity: new () => T, where?: object): Promise<T[]>;',
  '  count(entity: unknown, where?: object): Promise<number>;',
  '}',
].join('\n');

const { tester, typed } = typedIoProject('one-value', STORE, {
  'sequelize-store.ts':
    "import { Model } from 'sequelize';\nexport class Account extends Model { declare status: string; static findAll(options?: object): Promise<Account[]> { return Promise.resolve([]); } static findOne(options?: object): Promise<Account | null> { return Promise.resolve(null); } static count(options?: object): Promise<number> { return Promise.resolve(0); } }",
});

const HEADER = [
  "import { Repository } from 'typeorm';",
  "import type { EntityManager as Unused } from '@mikro-orm/core';",
  "import { PrismaClient } from '@prisma/client';",
  "import { Account } from './sequelize-store';",
  "import { Order, MikroManager } from './store';",
  'declare const orderRepo: Repository<Order>;',
  'declare const looseRepo: Repository<any>;',
  'declare const em: MikroManager;',
  'declare const prisma: PrismaClient;',
  'declare const cache: { count(): Promise<number> };',
  'declare function use(value: unknown): void;',
  '',
].join('\n');

const inRun = (body) => typed(`${HEADER}export async function run() { ${body} }`);
const column = (body, field) => ({
  ...inRun(body),
  errors: [{ messageId: 'column', data: { field } }],
});
const exists = (body) => ({ ...inRun(body), errors: [{ messageId: 'existence' }] });

tester.run('no-whole-rows-for-one-value', rule, {
  valid: [
    'const found = await orderRepo.findOne({ where: { status: "a" }, lock: { mode: "pessimistic_write" } }); if (!found) { use(1); }',
    'return !!(await prisma.order.findFirst({ where: { id: "a" }, skipLocked: true }));',
    'return (await orderRepo.find({ select: { status: true } })).map((order) => order.status);',
    'return (await orderRepo.find()).map((order) => order.label);',
    'return (await orderRepo.find()).map((order) => order.describe());',
    'return (await orderRepo.find()).map((order) => ({ status: order.status }));',
    'return (await orderRepo.find()).map((order) => order.status + order.total);',
    'return (await orderRepo.find()).map((order) => order.status.trim());',
    'const rows = await orderRepo.find(); use(rows); return rows.map((order) => order.status);',
    'return (await looseRepo.find()).map((order) => order.status);',
    'return (await orderRepo.find({ take: 5 })).map((order) => order.status);',
    'return (await prisma.order.findMany({ select: { id: true } })).map((row) => row.id);',
    'return (await prisma.order.findMany({ where: { id: "a" } })).map((row) => row.missing);',
    'const rows = await orderRepo.find(); await orderRepo.delete(rows.map((order) => order.status));',
    'return (await orderRepo.find()).filter((order) => order.status === "a").map((order) => order.status);',
    'return (await cache.count()) > 0;',
    'return (await orderRepo.count()) > 5;',
    'const total = await orderRepo.count(); use(total); return total > 0;',
    'const total = await orderRepo.count(); return total;',
    'return orderRepo.count();',
    'return (await orderRepo.count()) + 1 > 0;',
    'const found = await orderRepo.findOneBy({ status: "a" }); return found.status;',
    'const found = await orderRepo.findOneBy({ status: "a" }); if (found) { use(found.status); }',
    'const found = await orderRepo.findOneBy({ status: "a" }); return found;',
    'return !!(await prisma.order.findFirst({ where: { id: "a" }, select: { id: true } }));',
    'return (await orderRepo.findOne({ where: { status: "a" }, select: { id: true } })) !== null;',
    'return (await orderRepo.find()).length > 0;',
    'return (await Account.findAll()).map((row) => row.missing);',
    'return (await em.find(Order, {})).map((row) => row.label);',
    'return (await prisma.order.findUnique(args => args)) !== null;',
  ].map(inRun),
  invalid: [
    column(
      'return (await orderRepo.find({ where: { status: "a" } })).map((order) => order.status);',
      'status',
    ),
    column(
      'return (await orderRepo.findBy({ status: "a" })).map((order) => order.total);',
      'total',
    ),
    column(
      'const rows = await orderRepo.find(); return rows.map((order) => order.status);',
      'status',
    ),
    column(
      'const rows = await orderRepo.find(); return rows.map(({ status }) => status);',
      'status',
    ),
    column('return (await orderRepo.find()).map((order) => { return order.status; });', 'status'),
    column(
      'return (await prisma.order.findMany({ where: { id: "a" } })).map((row) => row.id);',
      'id',
    ),
    column(
      'const rows = await prisma.order.findMany(); const emails = rows.map((row) => row.id); use(emails);',
      'id',
    ),
    column(
      'return (await Account.findAll({ where: { status: "a" } })).map((row) => row.status);',
      'status',
    ),
    column('return (await em.find(Order, { status: "a" })).map((row) => row.status);', 'status'),
    column(
      'return (await orderRepo.createQueryBuilder("o").getMany()).map((order) => order.status);',
      'status',
    ),
    exists('return (await orderRepo.count({ where: { status: "a" } })) > 0;'),
    exists('return (await orderRepo.countBy({ status: "a" })) >= 1;'),
    exists('return (await orderRepo.count()) !== 0;'),
    exists('return (await orderRepo.count()) === 0;'),
    exists('return 0 < (await orderRepo.count());'),
    exists('return (await orderRepo.count()) < 1;'),
    exists('const total = await orderRepo.count({ where: { status: "a" } }); return total > 0;'),
    exists('if (await orderRepo.count({ where: { status: "a" } })) { use(1); }'),
    exists('return (await prisma.order.count({ where: { id: "a" } })) > 0;'),
    exists('return (await Account.count({ where: { status: "a" } })) > 0;'),
    exists('return (await em.count(Order, { status: "a" })) > 0;'),
    exists('return !!(await orderRepo.findOneBy({ status: "a" }));'),
    exists('return (await orderRepo.findOneBy({ status: "a" })) !== null;'),
    exists('return (await orderRepo.findOne({ where: { status: "a" } })) != undefined;'),
    exists('if (await orderRepo.findOneBy({ status: "a" })) { use(1); }'),
    exists(
      'const existing = await orderRepo.findOneBy({ status: "a" }); if (existing) { throw new Error("taken"); }',
    ),
    exists(
      'const existing = await orderRepo.findOneBy({ status: "a" }); if (!existing) { use(1); }',
    ),
    exists(
      'const existing = await prisma.order.findFirst({ where: { id: "a" } }); return Boolean(existing);',
    ),
    exists(
      'const existing = await Account.findOne({ where: { status: "a" } }); return existing === null;',
    ),
    exists('const existing = await orderRepo.findOneBy({ status: "a" }); return existing ? 1 : 2;'),
  ],
});
