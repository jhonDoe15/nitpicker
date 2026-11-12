import { rule } from './contract-infrastructure-type.mjs';
import { typedProject, writeCustomPrismaClient } from './test-support/typed-project.mjs';

const { write, tester, folder } = typedProject('nitpicker-contract-types-');
const CUSTOM_PRISMA = writeCustomPrismaClient(write);

const PRISMA = "import type { Prisma, PrismaClient } from '@prisma/client';\n";
const KNEX = "import type { Knex } from 'knex';\n";
const EXPRESS = "import type { NextFunction, Request, Response } from 'express';\n";

function feature(index, { siblings = {}, leaks, indexName = 'index.ts' } = {}) {
  const name = folder('f');
  for (const [file, content] of Object.entries(siblings)) {
    write(`src/main/features/${name}/${file}`, content);
  }
  const filename = write(`src/main/features/${name}/${indexName}`, index);
  const errors = leaks?.map(([kind, member, type, packageName]) => ({
    messageId: kind,
    data: { member, type, package: packageName, feature: name },
  }));
  return { filename, code: index, ...(errors === undefined ? {} : { errors }) };
}

tester.run('contract-infrastructure-type', rule, {
  valid: [
    feature(
      `${PRISMA}export function createOrders(db: PrismaClient) { return { list: (): Promise<string[]> => Promise.resolve([String(db)]) }; }`,
    ),
    feature(
      `${PRISMA}export class Orders { constructor(private readonly db: PrismaClient) {} list(): string[] { return [String(this.db)]; } private raw(): Prisma.TransactionClient { return this.db; } }`,
    ),
    feature(
      `${EXPRESS}export function getOrder(req: Request, res: Response): void { res.json(req.params); }`,
    ),
    feature(
      `${PRISMA}export interface OrderDeps { db: PrismaClient }\nexport type OrderView = { id: string };`,
    ),
    feature('export function render(): Response { return new Response("ok"); }'),
    feature(
      `${PRISMA}import type { User } from '@prisma/client';\nexport declare function owner(): User;`,
    ),
    feature("export { OrderView } from './view';", {
      siblings: { 'view.ts': 'export type OrderView = { id: string };\n' },
    }),
    {
      filename: write(
        'src/main/features/plain/service.ts',
        `${KNEX}export function rows(tx: Knex.Transaction): Promise<void> { return tx.commit(); }`,
      ),
      code: `${KNEX}export function rows(tx: Knex.Transaction): Promise<void> { return tx.commit(); }`,
    },
    feature(
      "import { Controller, Get, Req } from '@nestjs/common';\nimport type { Request } from 'express';\n@Controller('orders')\nexport class OrdersController { @Get() list(@Req() request: Request): string[] { return [String(request.body)]; } }",
    ),
    feature("import { Router } from 'express';\nexport const router: Router = Router();"),
    feature("import express from 'express';\nexport const app = express();"),
    feature(
      `${EXPRESS}export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void { res.json(String(err)); next(); }`,
    ),
    feature(
      `${PRISMA}export function authConfig(db: PrismaClient): { url: string } { return { url: String(db) }; }`,
    ),
    feature(
      `${PRISMA}import { router } from '@trpc/server';\nexport const appRouter = router({ db: {} as PrismaClient });\nexport type AppRouter = typeof appRouter;`,
    ),
    feature(
      `${PRISMA}export class Orders { static create(db: PrismaClient): Orders { return new Orders(String(db)); } constructor(private readonly name: string) {} list(): string[] { return [this.name]; } }`,
    ),
  ],
  invalid: [
    feature(
      `${PRISMA}export function findUsers(db: PrismaClient): Promise<string[]> { return Promise.resolve([String(db)]); }`,
      { leaks: [['persistence', 'findUsers', 'PrismaClient', '@prisma/client']] },
    ),
    feature(
      `${KNEX}type Tx = Knex.Transaction;\nexport const orders = { inTransaction(run: (tx: Tx) => Promise<void>): Promise<void> { return Promise.resolve(String(run)).then(() => undefined); } };`,
      { leaks: [['persistence', 'orders.inTransaction', 'Transaction', 'knex']] },
    ),
    feature("export { OrderService } from './service';", {
      siblings: {
        'service.ts': `${PRISMA}${KNEX}export class OrderService {\n  constructor(private readonly db: PrismaClient) {}\n  transaction(): Prisma.TransactionClient { return this.db; }\n  list(): Promise<Map<string, Knex.QueryBuilder<string>[]>> { return Promise.resolve(new Map()); }\n}\n`,
      },
      leaks: [
        ['persistence', 'OrderService.transaction', 'TransactionClient', '@prisma/client'],
        ['persistence', 'OrderService.list', 'QueryBuilder', 'knex'],
      ],
    }),
    feature(
      `${EXPRESS}export function sendOrder(id: string, res: Response): void { res.json(id); }`,
      { leaks: [['transport', 'sendOrder', 'Response', 'express']] },
    ),
    feature("export * from './api';", {
      siblings: { 'api.ts': `${EXPRESS}export declare function current(id: string): Request;\n` },
      leaks: [['transport', 'current', 'Request', 'express']],
    }),
    feature(
      `${PRISMA}export function createOrders(db: PrismaClient) { return { tx(): Prisma.TransactionClient { return db; }, list(): string[] { return []; } }; }`,
      { leaks: [['persistence', 'createOrders().tx', 'TransactionClient', '@prisma/client']] },
    ),
    feature(
      "/** @param {import('knex').Knex.Transaction} tx\n * @returns {Promise<void>} */\nexport function commit(tx) { return tx.commit(); }",
      { leaks: [['persistence', 'commit', 'Transaction', 'knex']], indexName: 'index.js' },
    ),
    feature(`${KNEX}export interface OrderStore { session(): Knex.Transaction; count(): number }`, {
      leaks: [['persistence', 'OrderStore.session', 'Transaction', 'knex']],
    }),
    feature(`${PRISMA}declare const client: PrismaClient;\nexport const db = client;`, {
      leaks: [['persistence', 'db', 'PrismaClient', '@prisma/client']],
    }),
    feature(
      `${PRISMA}export class Users { static find(db: PrismaClient): Promise<string[]> { return Promise.resolve([String(db)]); } }`,
      { leaks: [['persistence', 'Users.find', 'PrismaClient', '@prisma/client']] },
    ),
    feature(
      `import type { PrismaClient } from '${CUSTOM_PRISMA}';\nexport function findUsers(db: PrismaClient): Promise<string[]> { return Promise.resolve([String(db)]); }`,
      { leaks: [['persistence', 'findUsers', 'PrismaClient', '@prisma/client']] },
    ),
  ],
});
