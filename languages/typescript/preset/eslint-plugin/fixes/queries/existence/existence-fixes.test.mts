import { typedIoProject } from '../../../test-support/projects/typed-io-project.mts';
import {
  OLD_TYPEORM_PACKAGES,
  ORM_PACKAGES,
} from '../../../test-support/projects/orm/orm-stubs.mts';
import { rule } from '../../../rules/queries/columns/no-whole-rows-for-one-value.mts';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';

const STORE = [
  'export class Order { id = 0; status = ""; total = 0; }',
  "import { Model } from 'sequelize';",
  'export class Account extends Model { declare status: string; }',
].join('\n');
const HEADER = [
  "import { EntityManager, Repository } from 'typeorm';",
  "import { PrismaClient } from '@prisma/client';",
  "import { Account, Order } from './store';",
  'declare const orderRepo: Repository<Order>;',
  'declare const manager: EntityManager;',
  'declare const prisma: PrismaClient;',
  'declare const ready: boolean;',
  'declare const where: { status: string };',
  'declare function use(value: unknown): void;',
  '',
].join('\n');

const current = typedIoProject('existence-fix', STORE, {}, ORM_PACKAGES);
const old = typedIoProject('existence-fix-old', STORE, {}, OLD_TYPEORM_PACKAGES);

const code = (body: string) => `${HEADER}export async function run() { ${body} }`;
const selects = (field: string) => ({ messageId: 'selectOneField', data: { field } });
const exists = { messageId: 'useExists', data: {} };

function repaired(project: typeof current, body: string, output: string, suggestion = exists) {
  return {
    ...project.typed(code(body)),
    errors: [{ messageId: 'existence', suggestions: [{ ...suggestion, output: code(output) }] }],
  };
}
function declined(project: typeof current, body: string) {
  return { ...project.typed(code(body)), errors: [{ messageId: 'existence' }] };
}
const select = (body: string, output: string, field = 'id') =>
  repaired(current, body, output, selects(field));
const exist = (body: string, output: string) => repaired(current, body, output);

current.tester.run('no-whole-rows-for-one-value Prisma select suggestion', rule, {
  valid: [],
  invalid: [
    select(
      'if (await prisma.user.findFirst({ where: { email: "a" } })) { use(1); }',
      'if (await prisma.user.findFirst({ where: { email: "a" }, select: { id: true } })) { use(1); }',
    ),
    select(
      'const found = await prisma.user.findUnique({ where: { id: "a" } }); if (!found) { use(1); }',
      'const found = await prisma.user.findUnique({ where: { id: "a" }, select: { id: true } }); if (!found) { use(1); }',
    ),
    select(
      'return !!(await prisma.user.findFirst());',
      'return !!(await prisma.user.findFirst({ select: { id: true } }));',
    ),
    select(
      'return Boolean(await prisma.user.findFirst({ where: { id: "a" }, orderBy: { name: "asc" } }));',
      'return Boolean(await prisma.user.findFirst({ where: { id: "a" }, orderBy: { name: "asc" }, select: { id: true } }));',
    ),
    select(
      'return (await prisma.user.findFirst({ where: { id: "a" } })) !== null;',
      'return (await prisma.user.findFirst({ where: { id: "a" }, select: { id: true } })) !== null;',
    ),
    select(
      'return (await prisma.user.findUnique({ where: { id: "a" } })) === null;',
      'return (await prisma.user.findUnique({ where: { id: "a" }, select: { id: true } })) === null;',
    ),
    select(
      'return (await prisma.user.findFirst({ where: { id: "a" } })) ? 1 : 2;',
      'return (await prisma.user.findFirst({ where: { id: "a" }, select: { id: true } })) ? 1 : 2;',
    ),
    select(
      'return !!(await prisma.user.findFirst({}));',
      'return !!(await prisma.user.findFirst({ select: { id: true } }));',
    ),
    select(
      'return !!(await prisma.user.findFirst({ where: { id: "a" }, take: 1, skip: 2 }));',
      'return !!(await prisma.user.findFirst({ where: { id: "a" }, take: 1, skip: 2, select: { id: true } }));',
    ),
    select(
      'return !!(await prisma.link.findFirst({ where: { groupId: "g" } }));',
      'return !!(await prisma.link.findFirst({ where: { groupId: "g" }, select: { userId: true } }));',
      'userId',
    ),
    select(
      'return !(await prisma.link.findUnique({ where: { userId: "a" } }));',
      'return !(await prisma.link.findUnique({ where: { userId: "a" }, select: { userId: true } }));',
      'userId',
    ),
    select(
      'return (await prisma.user.findFirst({ where: { id: "a" } })) != undefined;',
      'return (await prisma.user.findFirst({ where: { id: "a" }, select: { id: true } })) != undefined;',
    ),
    select(
      'while (await prisma.user.findFirst({ where: { id: "a" } })) { use(1); }',
      'while (await prisma.user.findFirst({ where: { id: "a" }, select: { id: true } })) { use(1); }',
    ),
  ],
});

current.tester.run('no-whole-rows-for-one-value Prisma select declined', rule, {
  valid: [],
  invalid: [
    declined(
      current,
      'return !!(await prisma.user.findFirst({ where: { id: "a" }, include: { x: true } }));',
    ),
    declined(
      current,
      'return !!(await prisma.user.findFirst({ where: { id: "a" }, omit: { name: true } }));',
    ),
    declined(
      current,
      'return !!(await prisma.user.findFirst({ where: { id: "a" }, distinct: ["name"] }));',
    ),
    declined(
      current,
      'const args = { where: { id: "a" } }; return !!(await prisma.user.findFirst(args));',
    ),
    declined(current, 'return !!(await prisma.user.findFirst({ ...where }));'),
    declined(
      current,
      'return !!(await prisma.user.findFirst({ where: { id: "a" }, ["take"]: 1 }));',
    ),
    declined(current, 'return !!(await prisma.user.findFirst({ /* all */ }));'),
    declined(current, 'return !!(await prisma.loose.findFirst({ where: { id: "a" } }));'),
    declined(current, 'return (await prisma.user.count({ where: { id: "a" } })) > 0;'),
    declined(current, 'return !!(await prisma.user.findFirst({ where: { id: "a" } }, ready));'),
    declined(current, 'return !!(await Account.findOne({ where: { status: "a" } }));'),
  ],
});

current.tester.run('no-whole-rows-for-one-value TypeORM exists suggestion', rule, {
  valid: [],
  invalid: [
    exist(
      'return !!(await orderRepo.findOneBy({ status: "a" }));',
      'return !!(await orderRepo.existsBy({ status: "a" }));',
    ),
    exist(
      'if (await orderRepo.findOne({ where: { id: 1 }, withDeleted: true })) { use(1); }',
      'if (await orderRepo.exists({ where: { id: 1 }, withDeleted: true })) { use(1); }',
    ),
    exist(
      'return (await orderRepo.findOneBy({ status: "a" })) !== null;',
      'return await orderRepo.existsBy({ status: "a" });',
    ),
    exist(
      'return (await orderRepo.findOneBy(where)) != null;',
      'return await orderRepo.existsBy(where);',
    ),
    exist(
      'return (await orderRepo.findOneBy(where)) != undefined;',
      'return await orderRepo.existsBy(where);',
    ),
    exist(
      'return (await orderRepo.findOneBy(where)) === null;',
      'return !(await orderRepo.existsBy(where));',
    ),
    exist(
      'return (await orderRepo.findOne({ where })) == null;',
      'return !(await orderRepo.exists({ where }));',
    ),
    exist(
      'return null !== (await orderRepo.findOneBy(where));',
      'return await orderRepo.existsBy(where);',
    ),
    exist(
      'return ready && (await orderRepo.findOneBy(where)) !== null;',
      'return ready && await orderRepo.existsBy(where);',
    ),
    exist(
      'return ((await orderRepo.findOneBy(where)) !== null).toString();',
      'return ((await orderRepo.existsBy(where))).toString();',
    ),
    exist(
      'return !((await orderRepo.findOneBy(where)) === null);',
      'return !(!(await orderRepo.existsBy(where)));',
    ),
    exist(
      'const existing = await orderRepo.findOneBy(where); if (existing) { use(1); }',
      'const existing = await orderRepo.existsBy(where); if (existing) { use(1); }',
    ),
    exist(
      'const existing = await orderRepo.findOneBy(where); return existing !== null;',
      'const existing = await orderRepo.existsBy(where); return existing;',
    ),
    exist(
      'const existing = await orderRepo.findOneBy(where); return existing === null;',
      'const existing = await orderRepo.existsBy(where); return !existing;',
    ),
    exist(
      'const existing = await orderRepo.findOneBy(where); return ready || existing === null;',
      'const existing = await orderRepo.existsBy(where); return ready || !existing;',
    ),
    exist(
      'const existing = await orderRepo.findOne({ where }); return existing ? 1 : 2;',
      'const existing = await orderRepo.exists({ where }); return existing ? 1 : 2;',
    ),
    exist(
      'return (await manager.findOneBy(Order, where)) !== null;',
      'return await manager.existsBy(Order, where);',
    ),
    exist(
      'return !!(await manager.findOne(Order, { where, withDeleted: true }));',
      'return !!(await manager.exists(Order, { where, withDeleted: true }));',
    ),
  ],
});

current.tester.run('no-whole-rows-for-one-value TypeORM count suggestion', rule, {
  valid: [],
  invalid: [
    exist(
      'return (await orderRepo.count({ where })) > 0;',
      'return await orderRepo.exists({ where });',
    ),
    exist(
      'return (await orderRepo.countBy(where)) >= 1;',
      'return await orderRepo.existsBy(where);',
    ),
    exist('return (await orderRepo.count()) !== 0;', 'return await orderRepo.exists();'),
    exist('return (await orderRepo.count()) != 0;', 'return await orderRepo.exists();'),
    exist('return 0 < (await orderRepo.count());', 'return await orderRepo.exists();'),
    exist('return 1 <= (await orderRepo.count());', 'return await orderRepo.exists();'),
    exist('return (await orderRepo.count()) === 0;', 'return !(await orderRepo.exists());'),
    exist('return (await orderRepo.count()) == 0;', 'return !(await orderRepo.exists());'),
    exist('return (await orderRepo.count()) < 1;', 'return !(await orderRepo.exists());'),
    exist('return (await orderRepo.count()) <= 0;', 'return !(await orderRepo.exists());'),
    exist(
      'return 0 === (await orderRepo.countBy(where));',
      'return !(await orderRepo.existsBy(where));',
    ),
    exist('return 1 > (await orderRepo.count());', 'return !(await orderRepo.exists());'),
    exist(
      'if (await orderRepo.count({ where })) { use(1); }',
      'if (await orderRepo.exists({ where })) { use(1); }',
    ),
    exist(
      'const total = await orderRepo.count({ where, withDeleted: true }); return total > 0;',
      'const total = await orderRepo.exists({ where, withDeleted: true }); return total;',
    ),
    exist(
      'const total = await orderRepo.countBy(where); return total === 0;',
      'const total = await orderRepo.existsBy(where); return !total;',
    ),
    exist(
      'return (await manager.count(Order, { where })) > 0;',
      'return await manager.exists(Order, { where });',
    ),
    exist(
      'return (await manager.countBy(Order, where)) === 0;',
      'return !(await manager.existsBy(Order, where));',
    ),
  ],
});

current.tester.run('no-whole-rows-for-one-value TypeORM exists declined', rule, {
  valid: [],
  invalid: [
    declined(current, 'return !!(await orderRepo.findOne({ where, relations: ["x"] }));'),
    declined(current, 'return !!(await orderRepo.findOne({ where, order: { id: "ASC" } }));'),
    declined(
      current,
      'return !!(await orderRepo.findOne({ where, relationLoadStrategy: "query" }));',
    ),
    declined(current, 'return !!(await orderRepo.findOne({ where, cache: true }));'),
    declined(current, 'return !!(await orderRepo.findOne({ where, transaction: false }));'),
    declined(current, 'return !!(await orderRepo.findOne({}));'),
    declined(current, 'const options = { where }; return !!(await orderRepo.findOne(options));'),
    declined(current, 'return !!(await orderRepo.findOne({ where, ...where }));'),
    declined(current, 'return (await orderRepo.findOneBy(where)) !== undefined;'),
    declined(current, 'return (await orderRepo.findOneBy(where)) === undefined;'),
    declined(current, 'return !!(await orderRepo.findOneBy(...[where]));'),
    declined(
      current,
      'const found: Order | null = await orderRepo.findOneBy(where); return !!found;',
    ),
    declined(current, 'return (await orderRepo.findOneBy(where)) /* any */ !== null;'),
    declined(current, 'return (await orderRepo.count({ where, take: 3 })) > 0;'),
    declined(current, 'return (await orderRepo.count({ where, relations: ["x"] })) > 0;'),
    declined(current, 'return (await orderRepo.count({ where, skip: 1 })) > 0;'),
    declined(current, 'return !!(await manager.findOneBy(Order, ...[where]));'),
    declined(current, 'return !!(await manager.findOne(Order, { where, relations: ["x"] }));'),
  ],
});

old.tester.run('no-whole-rows-for-one-value TypeORM without exists', rule, {
  valid: [],
  invalid: [
    declined(old, 'return !!(await orderRepo.findOneBy(where));'),
    declined(old, 'return (await orderRepo.count({ where })) > 0;'),
    declined(old, 'return !!(await manager.findOneBy(Order, where));'),
  ],
});

typescriptRuleTester().run('no-whole-rows-for-one-value without type information', rule, {
  valid: [],
  invalid: [
    {
      code: 'import { Repository } from "typeorm"; export async function run(orderRepo) { return !!(await orderRepo.findOneBy({ a: 1 })); }',
      errors: [{ messageId: 'existence' }],
    },
    {
      code: 'import { PrismaClient } from "@prisma/client"; export async function run(prisma) { return !!(await prisma.user.findFirst({ where: { id: 1 } })); }',
      errors: [{ messageId: 'existence' }],
    },
  ],
});
