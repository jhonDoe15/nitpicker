import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-in-memory-query.mjs';

const TYPEORM = 'import { Repository } from "typeorm";';
const SEQUELIZE = 'import { Model } from "sequelize";';
const MIKRO = 'import { EntityManager } from "@mikro-orm/core";';
const DRIZZLE = 'import { eq } from "drizzle-orm";';
const LODASH = 'import _ from "lodash";';
const PRISMA = 'import { PrismaClient } from "@prisma/client";';
const inService = (header, body) =>
  `${header} export async function run(repo, prisma, db, em, Order, id, ids) { ${body} }`;
const errors = (messageId) => [{ messageId }];

const tester = createRuleTester();

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
  ],
  invalid: [
    {
      code: inService(TYPEORM, 'const rows = await repo.find(); return rows.length > 0;'),
      errors: errors('count'),
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
      code: inService(
        TYPEORM,
        'return (await repo.find())?.find((row) => ids.includes(row.customerId));',
      ),
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

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-in-memory-query-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2022'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const ENTITY = `${TYPEORM} class Order { status = ""; first = ""; last = ""; get fullName() { return this.first + this.last; } }`;
const typedTester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

function typed(body, messageId) {
  const code = `${ENTITY} export async function run(repo: { find(): Promise<Order[]> }, name: string) { ${body} }`;
  const file = path.join(root, `src/case-${randomUUID()}.ts`);
  writeFileSync(file, code);
  return {
    filename: file,
    code,
    ...(messageId === undefined ? {} : { errors: errors(messageId) }),
  };
}

typedTester.run('no-in-memory-query with types', rule, {
  valid: [
    typed('return (await repo.find()).filter((row) => row.fullName === name);'),
    typed('return (await repo.find()).sort((a, b) => a.fullName.localeCompare(b.fullName));'),
  ],
  invalid: [
    typed('return (await repo.find()).filter((row) => row.status === name);', 'filter'),
    typed('return (await repo.find()).sort((a, b) => a.last.localeCompare(b.last));', 'sort'),
  ],
});
