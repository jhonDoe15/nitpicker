import { typedIoProject } from '../../../test-support/projects/typed-io-project.mts';
import { ORM_PACKAGES } from '../../../test-support/projects/orm/orm-stubs.mts';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../../../rules/queries/no-in-memory-query.mts';

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
  'declare const email: string;',
  'declare const where: { status: string };',
  'declare function use(value: unknown): void;',
  '',
].join('\n');

const current = typedIoProject('count-fix', STORE, {}, ORM_PACKAGES);
const hooked = typedIoProject('count-fix-hooks', STORE, {}, ORM_PACKAGES);

const code = (body: string) => `${HEADER}export async function run() { ${body} }`;

function counted(body: string, output: string, method = 'count', project = current) {
  return {
    ...project.typed(code(body)),
    errors: [
      {
        messageId: 'count',
        suggestions: [{ messageId: 'useCount', data: { method }, output: code(output) }],
      },
    ],
  };
}
function declined(body: string, project = current) {
  return { ...project.typed(code(body)), errors: [{ messageId: 'count' }] };
}

const PRISMA_COUNTS: readonly (readonly [string, string])[] = [
  [
    'return (await prisma.user.findMany({ where: { email } })).length;',
    'return await prisma.user.count({ where: { email } });',
  ],
  [
    'return (await prisma.user.findMany({ where: { email }, select: { id: true } })).length;',
    'return await prisma.user.count({ where: { email } });',
  ],
  [
    'return (await prisma.user.findMany({ where: { email }, include: { x: true } })).length;',
    'return await prisma.user.count({ where: { email } });',
  ],
  [
    'return (await prisma.user.findMany({ orderBy: { id: "asc" }, where: { email } })).length;',
    'return await prisma.user.count({ where: { email } });',
  ],
  [
    'return (await prisma.user.findMany({ omit: { name: true }, where: { email } })).length;',
    'return await prisma.user.count({ where: { email } });',
  ],
  [
    'return (await prisma.user.findMany({ select: { id: true } })).length;',
    'return await prisma.user.count();',
  ],
  ['return (await prisma.user.findMany()).length;', 'return await prisma.user.count();'],
  [
    'return (await prisma.user.findMany({ where, relationLoadStrategy: "join" })).length;',
    'return await prisma.user.count({ where });',
  ],
  ['return (await prisma.user.findMany({})).length;', 'return await prisma.user.count({});'],
  [
    'return (await prisma.user.findMany({ where })).length > 0;',
    'return (await prisma.user.count({ where })) > 0;',
  ],
  [
    'return (await prisma.user.findMany({ where })).length === 0;',
    'return (await prisma.user.count({ where })) === 0;',
  ],
  [
    'use((await prisma.user.findMany({ where })).length);',
    'use(await prisma.user.count({ where }));',
  ],
  [
    'use({ total: (await prisma.user.findMany({ where })).length });',
    'use({ total: await prisma.user.count({ where }) });',
  ],
  [
    'const totals = [(await prisma.user.findMany({ where })).length]; use(totals);',
    'const totals = [await prisma.user.count({ where })]; use(totals);',
  ],
  [
    'const total = (await prisma.user.findMany({ where })).length; use(total);',
    'const total = await prisma.user.count({ where }); use(total);',
  ],
  [
    'const rows = await prisma.user.findMany({ where, select: { id: true } }); return rows.length;',
    'const rows = await prisma.user.count({ where }); return rows;',
  ],
  [
    'const rows = await prisma.user.findMany(); return rows.length > 0 ? 1 : 2;',
    'const rows = await prisma.user.count(); return rows > 0 ? 1 : 2;',
  ],
];

current.tester.run('no-in-memory-query Prisma count suggestion', rule, {
  valid: [],
  invalid: PRISMA_COUNTS.map(([body, output]) => counted(body, output)),
});

current.tester.run('no-in-memory-query Prisma count declined', rule, {
  valid: [],
  invalid: [
    declined('return (await prisma.user.findMany({ where, distinct: ["name"] })).length;'),
    declined('const args = { where }; return (await prisma.user.findMany(args)).length;'),
    declined('return (await prisma.user.findMany({ ...where })).length;'),
    declined('return (await prisma.user.findMany({ where }, email)).length;'),
    declined('return (await prisma.user.findMany({ /* all */ where })).length;'),
    declined('return (await prisma.user.findMany({ where }))?.length;'),
    declined('return ((await prisma.user.findMany({ where })) as unknown[]).length;'),
    declined('const rows: unknown[] = await prisma.user.findMany({ where }); return rows.length;'),
    declined('return (await prisma.user.findMany({ where, extra: 1 } as never)).length;'),
  ],
});

hooked.tester.run('no-in-memory-query count with query hooks', rule, {
  valid: [],
  invalid: [
    declined(
      'const client = prisma.$extends({}); return (await prisma.user.findMany({ where })).length;',
      hooked,
    ),
    counted(
      'return (await orderRepo.find({ where })).length;',
      'return await orderRepo.count({ where });',
      'count',
      hooked,
    ),
  ],
});

current.tester.run('no-in-memory-query TypeORM count suggestion', rule, {
  valid: [],
  invalid: [
    counted(
      'return (await orderRepo.find({ where })).length;',
      'return await orderRepo.count({ where });',
    ),
    counted(
      'return (await orderRepo.findBy({ status: "a" })).length;',
      'return await orderRepo.countBy({ status: "a" });',
      'countBy',
    ),
    counted(
      'return (await orderRepo.find({ where, relations: ["items"] })).length;',
      'return await orderRepo.count({ where });',
    ),
    counted(
      'return (await orderRepo.find({ select: { id: true }, where })).length;',
      'return await orderRepo.count({ where });',
    ),
    counted(
      'return (await orderRepo.find({ where, order: { id: "ASC" } })).length;',
      'return await orderRepo.count({ where });',
    ),
    counted(
      'return (await orderRepo.find({ where, withDeleted: true })).length;',
      'return await orderRepo.count({ where, withDeleted: true });',
    ),
    counted(
      'return (await orderRepo.find({ relations: ["items"], withDeleted: true, where })).length;',
      'return await orderRepo.count({ withDeleted: true, where });',
    ),
    counted(
      'return (await orderRepo.find({ relations: ["items"] })).length;',
      'return await orderRepo.count();',
    ),
    counted('return (await orderRepo.find()).length;', 'return await orderRepo.count();'),
    counted(
      'return (await orderRepo.find({ where, loadEagerRelations: false })).length === 0;',
      'return (await orderRepo.count({ where })) === 0;',
    ),
    counted(
      'return (await manager.find(Order, { where })).length;',
      'return await manager.count(Order, { where });',
    ),
    counted(
      'return (await manager.find(Order, { relations: ["items"] })).length;',
      'return await manager.count(Order);',
    ),
    counted(
      'return (await manager.findBy(Order, where)).length;',
      'return await manager.countBy(Order, where);',
      'countBy',
    ),
    counted(
      'const rows = await orderRepo.find({ where, relations: ["items"] }); return rows.length;',
      'const rows = await orderRepo.count({ where }); return rows;',
    ),
    counted(
      'const rows = await orderRepo.findBy(where); return rows.length > 3;',
      'const rows = await orderRepo.countBy(where); return rows > 3;',
      'countBy',
    ),
  ],
});

current.tester.run('no-in-memory-query TypeORM count declined', rule, {
  valid: [],
  invalid: [
    declined('return (await orderRepo.find({ where, cache: true })).length;'),
    declined('return (await orderRepo.find({ where, transaction: true })).length;'),
    declined('return (await orderRepo.find({ where, relationLoadStrategy: "query" })).length;'),
    declined(
      'return (await orderRepo.find({ where, select: { id: true }, relations: ["x"] })).length;',
    ),
    declined('return (await orderRepo.find({ ...where })).length;'),
    declined('const options = { where }; return (await orderRepo.find(options)).length;'),
    declined('return (await orderRepo.find({ where }, email)).length;'),
    declined('return (await orderRepo.findByIds([1])).length;'),
    declined('return (await orderRepo.createQueryBuilder("o").getMany()).length;'),
    declined('return (await orderRepo.find({ where /* any */ })).length;'),
    declined('return (await manager.find(Order, { where, cache: true })).length;'),
    declined('return (await Account.findAll({ where })).length;'),
  ],
});

typescriptRuleTester().run('no-in-memory-query count without type information', rule, {
  valid: [],
  invalid: [
    {
      code: 'import { Repository } from "typeorm"; export async function run(repo) { return (await repo.find({ where: { a: 1 } })).length; }',
      errors: [{ messageId: 'count' }],
    },
  ],
});
