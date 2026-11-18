import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { typedIoProject } from '../../test-support/projects/typed-io-project.mts';
import { ORM_PACKAGES } from '../../test-support/projects/orm/orm-stubs.mts';
import { rule } from './no-in-memory-query.mts';

const TYPEORM = 'import { Repository } from "typeorm";';
const SEQUELIZE = 'import { Model } from "sequelize";';
const MIKRO = 'import { EntityManager } from "@mikro-orm/core";';
const DRIZZLE = 'import { eq } from "drizzle-orm";';
const LODASH = 'import _ from "lodash";';
const PRISMA = 'import { PrismaClient } from "@prisma/client";';
const inService = (header: string, body: string) =>
  `${header} export async function run(repo, prisma, db, em, Order, id, ids) { ${body} }`;
const errors = (messageId: string) => [{ messageId }];

const tester = typescriptRuleTester();

tester.run('no-in-memory-query', rule, {
  valid: [
    inService(TYPEORM, 'return repo.count({ where: { status: "open" } });'),
    inService(TYPEORM, 'const rows = await repo.find(); return rows.length > 0 ? rows : [];'),
    inService(
      TYPEORM,
      'const rows = await repo.find(); return rows.map((row) => ({ id: row.id }));',
    ),
    inService(
      TYPEORM,
      'const rows = await repo.find(); return rows.filter((row) => policy.allows(row));',
    ),
    inService(
      TYPEORM,
      'const rows = await repo.find(); return rows.filter((row) => row.isOpen());',
    ),
    inService(TYPEORM, 'const rows = await repo.find(); return rows.filter((row) => row === id);'),
    inService(
      TYPEORM,
      'const rows = await repo.find(); for (const s of ids) { use(rows.filter((r) => r.status === s)); }',
    ),
    inService(
      TYPEORM,
      'const rows = await repo.find(); return ids.map((s) => rows.filter((r) => r.status === s));',
    ),
    inService(TYPEORM, 'const rows = await repo.find(); return rows.sort();'),
    inService(TYPEORM, 'return (await repo.find()).filter((row, index) => index > 0 && row.open);'),
    inService(
      TYPEORM,
      'return (await repo.find()).reduce(async (sum, row) => sum + row.total, 0);',
    ),
    inService(TYPEORM, 'return (await repo.find()).filter((row) => row.tags[id] === 1);'),
    inService('', 'const rows = await repo.find(); return rows.length;'),
    inService('', 'const rows = await client.findAll(); return rows.length;'),
    inService(TYPEORM, 'const list = await Promise.all(ids); return list.length;'),
    inService(TYPEORM, 'const found = await items.find((item) => item.id === id); return found;'),
    inService(
      DRIZZLE,
      'const rows = await db.select({ value: count() }).from(orders); return rows.length;',
    ),
    inService(
      DRIZZLE,
      'const rows = await db.select().from(orders).groupBy(orders.status); return rows.length;',
    ),
    inService(`${TYPEORM} ${LODASH}`, 'return _.map(await repo.find(), "id");'),
    inService(TYPEORM, 'const rows = await repo.find(); rows.length = 0; return rows;'),
    inService(TYPEORM, 'const rows = await cache.find(); return rows.length;'),
    inService(TYPEORM, 'return (await this.ldap.findAll()).length;'),
    inService(TYPEORM, 'return (await glob.find("*.ts")).length;'),
    inService('', 'return (await prismaCache.findMany()).length;'),
    inService(
      TYPEORM,
      'const rows = await repo.find({ take: 100, skip: id }); return rows.length < 100;',
    ),
    inService(TYPEORM, 'return (await repo.find({ take: 10 })).filter((row) => row.a === 1);'),
    inService(SEQUELIZE, 'return (await Order.findAll({ limit: 20 })).length;'),
    inService('', 'return (await prisma.user.findMany({ take: 10 })).length;'),
    inService(MIKRO, 'return (await em.find(Order, {}, { limit: 5 })).length;'),
    inService(DRIZZLE, 'return (await db.select().from(orders).limit(5)).length;'),
    inService(TYPEORM, 'return (await repo.createQueryBuilder("o").take(5).getMany()).length;'),
    inService(TYPEORM, 'return (await repo.find()).filter((row) => typeof row.a === "string");'),
    inService(
      TYPEORM,
      'return (await repo.find({ lock: { mode: "pessimistic_write" } })).filter((row) => row.id !== id);',
    ),
    inService(
      TYPEORM,
      'const rows = await repo.find({ lock: { mode: "pessimistic_read" } }); return rows.length;',
    ),
    inService(
      TYPEORM,
      'return (await repo.createQueryBuilder("o").setLock("pessimistic_write").getMany()).length;',
    ),
    inService(SEQUELIZE, 'return (await Order.findAll({ lock: true })).length;'),
    inService(
      TYPEORM,
      'return (await repo.find({ where: { id }, lock: { mode: "pessimistic_write" } })).length;',
    ),
    inService(TYPEORM, 'return (await repo.query("SELECT * FROM orders FOR UPDATE")).length;'),
    inService(TYPEORM, 'return (await repo.query(`select * from orders for share`)).length;'),
    inService(
      TYPEORM,
      'return (await repo.query("select * from orders lock in share mode")).length;',
    ),
    inService(TYPEORM, 'return (await repo.createQueryBuilder("o").forUpdate().getMany()).length;'),
    inService(
      TYPEORM,
      'return (await repo.createQueryBuilder("o").lock("update").getMany()).length;',
    ),
    inService(
      PRISMA,
      'return (await prisma.order.findMany({ where: { id } })).filter((row) => row.items.length === 1);',
    ),
    inService(TYPEORM, 'return (await repo.find()).filter((row) => row.items.length === 1);'),
    inService(TYPEORM, 'return (await repo.find()).filter(({ items }) => items.length > 0);'),
    inService(
      TYPEORM,
      'const known = new Set(ids); return (await repo.find()).filter((row) => !known.has(row.id));',
    ),
    inService(TYPEORM, 'return (await repo.find()).filter((row) => ids.includes(row.customerId));'),
    inService(TYPEORM, 'return (await repo.find()).find((row) => lookup.has(row.customerId));'),
    inService(
      TYPEORM,
      'return (await repo.find()).filter((row): row is Order => row.status !== null);',
    ),
  ],
  invalid: [
    {
      code: inService(TYPEORM, 'const rows = await repo.find(); return rows.length > 0;'),
      errors: errors('count'),
    },
    {
      code: inService(TYPEORM, 'return (await repo.find({ where: { lock: false } })).length;'),
      errors: errors('count'),
    },
    {
      code: inService(TYPEORM, 'return (await repo.find({ where: { status: "lock" } })).length;'),
      errors: errors('count'),
    },
    {
      code: inService(
        TYPEORM,
        'return (await repo.find({ where: { lock: { mode: "x" } } })).filter((row) => row.id !== id);',
      ),
      errors: errors('filter'),
    },
    {
      code: inService(TYPEORM, 'return (await repo.findBy({ status: "open" })).length === 0;'),
      errors: errors('count'),
    },
    {
      code: inService(TYPEORM, 'return (await this.ordersRepository.find()).length;'),
      errors: errors('count'),
    },
    {
      code: inService(PRISMA, 'return (await tx.order.findMany({ where: { id } })).length;'),
      errors: errors('count'),
    },
    {
      code: inService(DRIZZLE, 'return (await db.query.orders.findMany()).length;'),
      errors: errors('count'),
    },
    {
      code: inService(TYPEORM, 'return (await repo.findByIds(ids)).length;'),
      errors: errors('count'),
    },
    {
      code: inService('', 'return (await prisma.user.findMany({ where: { id } })).length;'),
      errors: errors('count'),
    },
    {
      code: inService(
        SEQUELIZE,
        'const rows = await Order.findAll({ where: { id } }); return rows.length;',
      ),
      errors: errors('count'),
    },
    {
      code: inService(MIKRO, 'const rows = await em.find(Order, { id }); return rows.length;'),
      errors: errors('count'),
    },
    {
      code: inService(
        DRIZZLE,
        'const rows = await db.select().from(orders).where(eq(orders.id, id)); return rows.length;',
      ),
      errors: errors('count'),
    },
    {
      code: inService(
        TYPEORM,
        'const rows = await repo.find(); return rows.filter((row) => row.status === "open");',
      ),
      errors: errors('filter'),
    },
    {
      code: inService(
        TYPEORM,
        'const rows = await repo.find(); return rows.some(({ status }) => status === id);',
      ),
      errors: errors('filter'),
    },
    {
      code: inService(TYPEORM, 'return (await repo.find())?.find((row) => row.tags.includes(id));'),
      errors: errors('filter'),
    },
    {
      code: inService(
        TYPEORM,
        'return (await repo.find()).every((row) => row.total > this.limit && !row.closed);',
      ),
      errors: errors('filter'),
    },
    {
      code: inService(
        TYPEORM,
        'return (await repo.find()).filter((row) => row.name.toLowerCase().startsWith(id));',
      ),
      errors: errors('filter'),
    },
    {
      code: inService(
        TYPEORM,
        'const rows = await repo.find(); return rows.sort((a, b) => a.name.localeCompare(b.name));',
      ),
      errors: errors('sort'),
    },
    {
      code: inService(
        TYPEORM,
        'return (await repo.find()).toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());',
      ),
      errors: errors('sort'),
    },
    {
      code: inService(
        TYPEORM,
        'return (await repo.find()).reduce((sum, row) => sum + row.total, 0);',
      ),
      errors: errors('aggregate'),
    },
    {
      code: inService(
        TYPEORM,
        'return (await repo.find()).reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});',
      ),
      errors: errors('aggregate'),
    },
    {
      code: inService(TYPEORM, 'return Math.max(...(await repo.find()).map((row) => row.total));'),
      errors: errors('aggregate'),
    },
    {
      code: inService(
        TYPEORM,
        'const rows = await repo.find(); return Object.groupBy(rows, (row) => row.status);',
      ),
      errors: errors('aggregate'),
    },
    {
      code: inService(`${TYPEORM} ${LODASH}`, 'return _.sumBy(await repo.find(), "total");'),
      errors: errors('aggregate'),
    },
    {
      code: inService(
        `${TYPEORM} ${LODASH}`,
        'return _.orderBy(await repo.find(), ["createdAt"]);',
      ),
      errors: errors('sort'),
    },
    {
      code: inService(
        `${TYPEORM} import { isEmpty } from "lodash-es";`,
        'return isEmpty(await repo.find());',
      ),
      errors: errors('count'),
    },
    {
      code: inService(
        TYPEORM,
        'const rows = await repo.find(); for (const row of rows.filter((r) => r.open)) { use(row); }',
      ),
      errors: errors('filter'),
    },
    {
      code: inService(
        TYPEORM,
        'return (await repo.createQueryBuilder("o").where("o.id = :id", { id }).getMany()).length;',
      ),
      errors: errors('count'),
    },
  ],
});

const STORE = [
  "import { Repository } from 'typeorm';",
  'export class Order { status = ""; first = ""; last = ""; get fullName() { return this.first + this.last; } }',
  'export declare class Wrapper {',
  '  find(workspaceId: string, options?: { where?: object }): Promise<Order[]>;',
  '  findBy(where: object): Promise<Order[]>;',
  '}',
  'export declare class Overriding extends Repository<Order> {',
  '  find(): Promise<Order[]>;',
  '}',
].join('\n');

const { tester: typedTester, typed: typedFile } = typedIoProject(
  'in-memory-query',
  STORE,
  {},
  ORM_PACKAGES,
);
const TYPED_HEADER = [
  "import { Repository } from 'typeorm';",
  "import { PrismaClient } from '@prisma/client';",
  "import { Order, Wrapper, Overriding } from './store';",
  'declare const repo: Repository<Order>;',
  'declare const wrapperRepo: Wrapper;',
  'declare const overridingRepo: Overriding;',
  'declare const prisma: PrismaClient;',
  'declare const name: string;',
  '',
].join('\n');

function typed(body: string): { filename?: string; code: string };
function typed(
  body: string,
  messageId: string,
): { filename?: string; code: string; errors: { messageId: string }[] };
function typed(body: string, messageId?: string) {
  const file = typedFile(`${TYPED_HEADER}export async function run() { ${body} }`);
  return messageId === undefined ? file : { ...file, errors: errors(messageId) };
}

typedTester.run('no-in-memory-query with types', rule, {
  valid: [
    typed('return (await repo.find()).filter((row) => row.fullName === name);'),
    typed('return (await repo.find()).sort((a, b) => a.fullName.localeCompare(b.fullName));'),
    typed('return (await wrapperRepo.find("workspace", { where: { id: name } })).length;'),
    typed('return (await wrapperRepo.findBy({ id: name })).filter((row) => row.status === name);'),
    typed('return (await overridingRepo.find()).length;'),
  ],
  invalid: [
    typed('return (await repo.find()).filter((row) => row.status === name);', 'filter'),
    typed('return (await repo.find()).sort((a, b) => a.last.localeCompare(b.last));', 'sort'),
    typed('return (await repo.find({ where: { status: name } })).length;', 'count'),
    typed('return (await prisma.user.findMany({ where: { id: name } })).length;', 'count'),
  ],
});
