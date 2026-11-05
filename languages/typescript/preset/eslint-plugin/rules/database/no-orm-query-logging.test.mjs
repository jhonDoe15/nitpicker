import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule } from './no-orm-query-logging.mjs';

const tester = createRuleTester();
const logs = (form) => [{ messageId: 'queryLogging', data: { form } }];
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
      errors: logs('logging'),
    },
    {
      code: `${TYPEORM} export const db = new DataSource({ type: "postgres", logging: "all" });`,
      errors: logs('logging'),
    },
    {
      code: `${TYPEORM} export const db = new DataSource({ type: "postgres", logging: ["query", "error"] });`,
      errors: logs('logging'),
    },
    {
      code: 'export default { type: "mysql", entities: ["dist/**/*.entity.js"], logging: process.env.NODE_ENV !== "production" };',
      errors: logs('logging'),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(url, { logging: console.log });`,
      errors: logs('logging'),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(url, { logging: isDev ? console.log : false });`,
      errors: logs('logging'),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(url, { logging: false, logQueryParameters: true });`,
      errors: logs('logQueryParameters'),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(process.env.DATABASE_URL);`,
      errors: logs('new Sequelize(...)` without `logging: false'),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize("app", "user", password);`,
      errors: logs('new Sequelize(...)` without `logging: false'),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(url, { dialect: "postgres", pool: { max: 5 } });`,
      errors: logs('new Sequelize(...)` without `logging: false'),
    },
    {
      code: `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", models: [User] });`,
      errors: logs('SequelizeModule.forRoot(...)` without `logging: false'),
    },
    {
      code: `${MIKRO} export default defineConfig({ dbName: "app", debug: true });`,
      errors: logs('debug'),
    },
    {
      code: `${MIKRO} export default defineConfig({ dbName: "app", debug: ["query", "query-params"] });`,
      errors: logs('debug'),
    },
    {
      code: 'module.exports = { client: "pg", connection: process.env.DATABASE_URL, debug: true };',
      errors: logs('debug'),
    },
    {
      code: `${PRISMA} export const prisma = new PrismaClient({ log: ["query", "error"] });`,
      errors: logs('log'),
    },
    {
      code: `${PRISMA} export const prisma = new PrismaClient({ log: [{ emit: "stdout", level: "query" }] });`,
      errors: logs('log'),
    },
    {
      code: `${PRISMA} export class Db extends PrismaClient { constructor() { super({ log: isDev ? ["query"] : [] }); } }`,
      errors: logs('log'),
    },
    {
      code: `${DRIZZLE} export const db = drizzle(pool, { logger: true });`,
      errors: logs('logger'),
    },
    {
      code: 'import { drizzle as dz, DefaultLogger } from "drizzle-orm/node-postgres"; export const db = dz(pool, { logger: new DefaultLogger() });',
      errors: logs('logger'),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize(url, { logging: (sql) => logger.debug(sql) });`,
      errors: logs('logging'),
    },
    {
      code: 'import { Sequelize as SQ } from "@sequelize/core"; export const db = new SQ("postgres://db/app");',
      errors: logs('new Sequelize(...)` without `logging: false'),
    },
    {
      code: `${NEST_SEQUELIZE} export const m = SequelizeModule.forRootAsync({ useFactory: () => ({ dialect: "postgres", autoLoadModels: false }) });`,
      errors: logs('SequelizeModule.forRootAsync(...)` without `logging: false'),
    },
    {
      code: 'import { PrismaClient } from "@prisma/client"; export const prisma = new PrismaClient({ log: [{ level: "query" }] });',
      errors: logs('log'),
    },
    {
      code: 'module.exports = { client: "mysql2", debug: process.env.DB_DEBUG === "1" };',
      errors: logs('debug'),
    },
  ],
});
