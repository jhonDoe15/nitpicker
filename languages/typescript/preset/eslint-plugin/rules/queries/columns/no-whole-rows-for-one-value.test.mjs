import { typedIoProject } from '../../../test-support/projects/typed-io-project.mts';
import { IO_PACKAGES } from '../../../test-support/projects/io-packages.mts';
import { ORM_PACKAGES } from '../../../test-support/projects/orm/orm-stubs.mts';
import { rule } from './no-whole-rows-for-one-value.mts';

const STORE = [
  "import { Entity, Column } from 'typeorm';",
  '@Entity() export class Order {',
  '  @Column() status = "";',
  '  @Column() total = 0;',
  '  get label() { return this.status; }',
  '  describe() { return this.status; }',
  '}',
].join('\n');

const { tester, typed } = typedIoProject(
  'one-value',
  STORE,
  {
    'sequelize-store.ts':
      "import { Model } from 'sequelize';\nexport class Account extends Model { declare status: string; }",
    'wrappers.ts': [
      "import { Order } from './store';",
      'export declare class Wrapper {',
      '  findOne(workspaceId: string, options?: { where?: object }): Promise<Order | null>;',
      '  findOneBy(where: object): Promise<Order | null>;',
      '  count(options?: object): Promise<number>;',
      '}',
    ].join('\n'),
    'repositories.ts': [
      "import { Repository } from 'typeorm';",
      "import { Order } from './store';",
      'export class Inheriting extends Repository<Order> {}',
      'export class Overriding extends Repository<Order> {',
      '  findOneBy(where: object): Promise<Order | null> { return super.findOneBy(where); }',
      '}',
    ].join('\n'),
    'generated-client.ts': [
      "import type * as runtime from '@prisma/client/runtime/library';",
      'type Row = { id: string };',
      'export declare const prismaGenerated: {',
      '  order: { findFirst(args?: { where?: object }): Promise<Row | null> };',
      '};',
      'export type Runtime = typeof runtime;',
    ].join('\n'),
  },
  { ...IO_PACKAGES, ...ORM_PACKAGES },
);

const HEADER = [
  "import { Repository } from 'typeorm';",
  "import { EntityManager } from '@mikro-orm/core';",
  "import { PrismaClient } from '@prisma/client';",
  "import { Account } from './sequelize-store';",
  "import { Order } from './store';",
  "import { Wrapper } from './wrappers';",
  "import { Inheriting, Overriding } from './repositories';",
  "import { prismaGenerated } from './generated-client';",
  'declare const inheritingRepo: Inheriting;',
  'declare const overridingRepo: Overriding;',
  'declare const orderRepo: Repository<Order>;',
  'declare const looseRepo: Repository<any>;',
  'declare const em: EntityManager;',
  'declare const workspaceRepo: Wrapper;',
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
const fixed = (body, output, suggestion = { messageId: 'useExists' }) => ({
  ...inRun(body),
  errors: [
    {
      messageId: 'existence',
      suggestions: [
        { ...suggestion, output: `${HEADER}export async function run() { ${output} }` },
      ],
    },
  ],
});
const selecting = { messageId: 'selectOneField', data: { field: 'id' } };

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
    'return !!(await workspaceRepo.findOne("workspace", { where: { id: "a" } }));',
    'const found = await workspaceRepo.findOneBy({ status: "a" }); if (!found) { use(1); }',
    'return (await workspaceRepo.count()) > 0;',
    'return !!(await overridingRepo.findOneBy({ status: "a" }));',
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
    fixed(
      'return (await orderRepo.count({ where: { status: "a" } })) > 0;',
      'return await orderRepo.exists({ where: { status: "a" } });',
    ),
    fixed(
      'return (await orderRepo.countBy({ status: "a" })) >= 1;',
      'return await orderRepo.existsBy({ status: "a" });',
    ),
    fixed('return (await orderRepo.count()) !== 0;', 'return await orderRepo.exists();'),
    fixed('return (await orderRepo.count()) === 0;', 'return !(await orderRepo.exists());'),
    fixed('return 0 < (await orderRepo.count());', 'return await orderRepo.exists();'),
    fixed('return (await orderRepo.count()) < 1;', 'return !(await orderRepo.exists());'),
    fixed(
      'const total = await orderRepo.count({ where: { status: "a" } }); return total > 0;',
      'const total = await orderRepo.exists({ where: { status: "a" } }); return total;',
    ),
    fixed(
      'if (await orderRepo.count({ where: { status: "a" } })) { use(1); }',
      'if (await orderRepo.exists({ where: { status: "a" } })) { use(1); }',
    ),
    exists('return (await prisma.order.count({ where: { id: "a" } })) > 0;'),
    exists('return (await Account.count({ where: { status: "a" } })) > 0;'),
    exists('return (await em.count(Order, { status: "a" })) > 0;'),
    fixed(
      'return !!(await orderRepo.findOneBy({ status: "a" }));',
      'return !!(await orderRepo.existsBy({ status: "a" }));',
    ),
    fixed(
      'return !!(await inheritingRepo.findOneBy({ status: "a" }));',
      'return !!(await inheritingRepo.existsBy({ status: "a" }));',
    ),
    fixed(
      'return !!(await prismaGenerated.order.findFirst({ where: { id: "a" } }));',
      'return !!(await prismaGenerated.order.findFirst({ where: { id: "a" }, select: { id: true } }));',
      selecting,
    ),
    fixed(
      'return (await orderRepo.findOneBy({ status: "a" })) !== null;',
      'return await orderRepo.existsBy({ status: "a" });',
    ),
    fixed(
      'return (await orderRepo.findOne({ where: { status: "a" } })) != undefined;',
      'return await orderRepo.exists({ where: { status: "a" } });',
    ),
    fixed(
      'if (await orderRepo.findOneBy({ status: "a" })) { use(1); }',
      'if (await orderRepo.existsBy({ status: "a" })) { use(1); }',
    ),
    fixed(
      'const existing = await orderRepo.findOneBy({ status: "a" }); if (existing) { throw new Error("taken"); }',
      'const existing = await orderRepo.existsBy({ status: "a" }); if (existing) { throw new Error("taken"); }',
    ),
    fixed(
      'const existing = await orderRepo.findOneBy({ status: "a" }); if (!existing) { use(1); }',
      'const existing = await orderRepo.existsBy({ status: "a" }); if (!existing) { use(1); }',
    ),
    fixed(
      'const existing = await prisma.order.findFirst({ where: { id: "a" } }); return Boolean(existing);',
      'const existing = await prisma.order.findFirst({ where: { id: "a" }, select: { id: true } }); return Boolean(existing);',
      selecting,
    ),
    exists(
      'const existing = await Account.findOne({ where: { status: "a" } }); return existing === null;',
    ),
    fixed(
      'const existing = await orderRepo.findOneBy({ status: "a" }); return existing ? 1 : 2;',
      'const existing = await orderRepo.existsBy({ status: "a" }); return existing ? 1 : 2;',
    ),
  ],
});
