import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-orm-query-logging.mts';

const tester = typescriptRuleTester();
const fixes = (form: string, output: string) => [
  { messageId: 'queryLogging', data: { form }, suggestions: [{ messageId: 'quiet', output }] },
];
const logs = (form: string) => [{ messageId: 'queryLogging', data: { form } }];
const TYPEORM = 'import { DataSource } from "typeorm";';
const SEQUELIZE = 'import { Sequelize } from "sequelize";';
const NEST_SEQUELIZE = 'import { SequelizeModule } from "@nestjs/sequelize";';
const MIKRO = 'import { defineConfig } from "@mikro-orm/postgresql";';
const PRISMA = 'import { PrismaClient } from "@prisma/client";';
const DRIZZLE = 'import { drizzle } from "drizzle-orm/node-postgres";';

tester.run('no-orm-query-logging', rule, {
  valid: [
    `${TYPEORM} export const db = new DataSource({ type: "postgres", logging: false, maxQueryExecutionTime: 500 });`,
    `${TYPEORM} export const db = new DataSource({ type: "postgres", logging: ["error", "warn", "migration"] });`,
    'export const options = { logging: true };',
    `${SEQUELIZE} export const db = new Sequelize(process.env.DATABASE_URL, { logging: false });`,
    `${SEQUELIZE} export const db = new Sequelize(url, { benchmark: true, logging: (sql, ms) => { if (ms > 500) logger.warn({ ms }, "slow query"); } });`,
    `${SEQUELIZE} export const db = new Sequelize(config);`,
    `${SEQUELIZE} export const db = (base) => new Sequelize({ ...base, dialect: "postgres" });`,
    `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", logging: false });`,
    `${MIKRO} export default defineConfig({ dbName: "app", debug: false });`,
    `${MIKRO} export default defineConfig({ dbName: "app", debug: ["discovery", "info"] });`,
    'export const knexConfig = { client: "pg", connection: url, debug: false };',
    'export const flags = { debug: true, verbose: false };',
    `${PRISMA} export const prisma = new PrismaClient({ log: ["warn", "error"] });`,
    `${PRISMA} export const prisma = new PrismaClient({ log: [{ emit: "event", level: "query" }] });`,
    `${DRIZZLE} export const db = drizzle(pool, { logger: false });`,
    `${DRIZZLE} export const db = drizzle(pool, { logger: new SlowQueryLogger() });`,
    `${TYPEORM} export const server = app.listen({ logging: true, port: 1 });`,
    `${SEQUELIZE} export const sock = { logging: console.log, logQueryParameters: true };`,
    `${MIKRO} export const argv = yargs({ debug: true });`,
    `${SEQUELIZE} export const db = new Sequelize(url, { benchmark: true, logging: (sql, ms) => ms > 500 && logger.warn({ ms }, "slow") });`,
    `${PRISMA} export const prisma = new PrismaClient({ log: [{ emit: "event", level: "query" }, "error"] });`,
  ],
  invalid: [
    {
      code: `${TYPEORM} export const db = new DataSource({ type: "postgres", logging: true });`,
      errors: fixes(
        'logging',
        `${TYPEORM} export const db = new DataSource({ type: "postgres", logging: ['error', 'warn'] });`,
      ),
    },
    {
      code: `${TYPEORM} export const db = new DataSource({ type: "postgres", logging: "all" });`,
      errors: fixes(
        'logging',
        `${TYPEORM} export const db = new DataSource({ type: "postgres", logging: ['log', 'info', 'warn', 'error', 'schema', 'migration'] });`,
      ),
    },
    {
      code: `${TYPEORM} export const db = new DataSource({ type: "postgres", logging: ["query", "error"] });`,
      errors: fixes(
        'logging',
        `${TYPEORM} export const db = new DataSource({ type: "postgres", logging: ["error"] });`,
      ),
    },
    {
      code: 'export default { type: "mysql", entities: ["dist/**/*.entity.js"], logging: process.env.NODE_ENV !== "production" };',
      errors: logs('logging'),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(url, { logging: console.log });`,
      errors: fixes(
        'logging',
        `${SEQUELIZE} export const db = new Sequelize(url, { logging: false });`,
      ),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(url, { logging: isDev ? console.log : false });`,
      errors: logs('logging'),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(url, { logging: false, logQueryParameters: true });`,
      errors: fixes(
        'logQueryParameters',
        `${SEQUELIZE} export const db = new Sequelize(url, { logging: false, logQueryParameters: false });`,
      ),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(process.env.DATABASE_URL);`,
      errors: fixes(
        'new Sequelize(...)` without `logging: false',
        `${SEQUELIZE} export const db = new Sequelize(process.env.DATABASE_URL, { logging: false });`,
      ),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize("app", "user", password);`,
      errors: fixes(
        'new Sequelize(...)` without `logging: false',
        `${SEQUELIZE} export const db = new Sequelize("app", "user", password, { logging: false });`,
      ),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(url, { dialect: "postgres", pool: { max: 5 } });`,
      errors: fixes(
        'new Sequelize(...)` without `logging: false',
        `${SEQUELIZE} export const db = new Sequelize(url, { dialect: "postgres", pool: { max: 5 }, logging: false });`,
      ),
    },
    {
      code: `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", models: [User] });`,
      errors: fixes(
        'SequelizeModule.forRoot(...)` without `logging: false',
        `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", models: [User], logging: false });`,
      ),
    },
    {
      code: `${MIKRO} export default defineConfig({ dbName: "app", debug: true });`,
      errors: fixes(
        'debug',
        `${MIKRO} export default defineConfig({ dbName: "app", debug: false });`,
      ),
    },
    {
      code: `${MIKRO} export default defineConfig({ dbName: "app", debug: ["query", "query-params"] });`,
      errors: fixes(
        'debug',
        `${MIKRO} export default defineConfig({ dbName: "app", debug: false });`,
      ),
    },
    {
      code: 'module.exports = { client: "pg", connection: process.env.DATABASE_URL, debug: true };',
      errors: logs('debug'),
    },
    {
      code: `${PRISMA} export const prisma = new PrismaClient({ log: ["query", "error"] });`,
      errors: fixes('log', `${PRISMA} export const prisma = new PrismaClient({ log: ["error"] });`),
    },
    {
      code: `${PRISMA} export const prisma = new PrismaClient({ log: [{ emit: "stdout", level: "query" }] });`,
      errors: fixes('log', `${PRISMA} export const prisma = new PrismaClient({ log: [] });`),
    },
    {
      code: `${PRISMA} export class Db extends PrismaClient { constructor() { super({ log: isDev ? ["query"] : [] }); } }`,
      errors: logs('log'),
    },
    {
      code: `${DRIZZLE} export const db = drizzle(pool, { logger: true });`,
      errors: fixes('logger', `${DRIZZLE} export const db = drizzle(pool, { logger: false });`),
    },
    {
      code: 'import { drizzle as dz, DefaultLogger } from "drizzle-orm/node-postgres"; export const db = dz(pool, { logger: new DefaultLogger() });',
      errors: fixes(
        'logger',
        'import { drizzle as dz, DefaultLogger } from "drizzle-orm/node-postgres"; export const db = dz(pool, { logger: false });',
      ),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(url, { logging: (sql) => logger.info(sql) });`,
      errors: fixes(
        'logging',
        `${SEQUELIZE} export const db = new Sequelize(url, { logging: false });`,
      ),
    },
    {
      code: 'import { Sequelize as SQ } from "@sequelize/core"; export const db = new SQ("postgres://db/app");',
      errors: fixes(
        'new Sequelize(...)` without `logging: false',
        'import { Sequelize as SQ } from "@sequelize/core"; export const db = new SQ("postgres://db/app", { logging: false });',
      ),
    },
    {
      code: `${NEST_SEQUELIZE} export const m = SequelizeModule.forRootAsync({ useFactory: () => ({ dialect: "postgres", autoLoadModels: false }) });`,
      errors: fixes(
        'SequelizeModule.forRootAsync(...)` without `logging: false',
        `${NEST_SEQUELIZE} export const m = SequelizeModule.forRootAsync({ useFactory: () => ({ dialect: "postgres", autoLoadModels: false, logging: false }) });`,
      ),
    },
    {
      code: 'import { PrismaClient } from "@prisma/client"; export const prisma = new PrismaClient({ log: [{ level: "query" }] });',
      errors: fixes(
        'log',
        'import { PrismaClient } from "@prisma/client"; export const prisma = new PrismaClient({ log: [] });',
      ),
    },
    {
      code: 'module.exports = { client: "mysql2", debug: process.env.DB_DEBUG === "1" };',
      errors: logs('debug'),
    },
  ],
});
