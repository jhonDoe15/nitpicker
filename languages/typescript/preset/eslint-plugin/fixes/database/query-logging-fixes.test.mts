import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/database/no-orm-query-logging.mts';

const TYPEORM = 'import { DataSource } from "typeorm";';
const SEQUELIZE = 'import { Sequelize } from "sequelize";';
const NEST_SEQUELIZE = 'import { SequelizeModule } from "@nestjs/sequelize";';
const MIKRO = 'import { defineConfig, MikroORM } from "@mikro-orm/postgresql";';
const PRISMA = 'import { PrismaClient } from "@prisma/client";';
const DRIZZLE = 'import { drizzle } from "drizzle-orm/node-postgres";';
const DRIZZLE_LOGGER = 'import { drizzle, DefaultLogger } from "drizzle-orm/node-postgres";';
const FORM = {
  logging: 'logging',
  parameters: 'logQueryParameters',
  debug: 'debug',
  log: 'log',
  logger: 'logger',
  sequelize: 'new Sequelize(...)` without `logging: false',
  nest: 'SequelizeModule.forRoot(...)` without `logging: false',
  async: 'SequelizeModule.forRootAsync(...)` without `logging: false',
} as const;

function fixed(code: string, output: string, form: string) {
  return {
    code,
    errors: [
      { messageId: 'queryLogging', data: { form }, suggestions: [{ messageId: 'quiet', output }] },
    ],
  };
}
function declined(code: string, form: string) {
  return { code, errors: [{ messageId: 'queryLogging', data: { form } }] };
}

const typeorm = (options: string) =>
  `${TYPEORM} export const db = new DataSource({ type: "postgres", ${options} });`;
const sequelizeOptions = (options: string) =>
  `${SEQUELIZE} export const db = new Sequelize(url, { ${options} });`;
const prisma = (options: string) =>
  `${PRISMA} export const prisma = new PrismaClient({ ${options} });`;
const mikro = (options: string) =>
  `${MIKRO} export default defineConfig({ dbName: "app", ${options} });`;

typescriptRuleTester().run('no-orm-query-logging suggestion', rule, {
  valid: [],
  invalid: [
    fixed(typeorm('logging: true'), typeorm("logging: ['error', 'warn']"), FORM.logging),
    fixed(
      typeorm('logging: "all"'),
      typeorm("logging: ['log', 'info', 'warn', 'error', 'schema', 'migration']"),
      FORM.logging,
    ),
    fixed(
      typeorm('logging: ["query", "error", "schema"]'),
      typeorm('logging: ["error", "schema"]'),
      FORM.logging,
    ),
    fixed(typeorm('logging: ["query"]'), typeorm('logging: false'), FORM.logging),
    fixed(
      typeorm('logging: ["error", "all"]'),
      typeorm("logging: ['log', 'info', 'warn', 'error', 'schema', 'migration']"),
      FORM.logging,
    ),
    fixed(
      typeorm('logging: ["warn", "query", "migration"], maxQueryExecutionTime: 500'),
      typeorm('logging: ["warn", "migration"], maxQueryExecutionTime: 500'),
      FORM.logging,
    ),
    fixed(
      typeorm('logging: false, logQueryParameters: true'),
      typeorm('logging: false, logQueryParameters: false'),
      FORM.parameters,
    ),
    fixed(
      'import { createConnection } from "typeorm"; export const c = createConnection({ type: "postgres", logging: true });',
      'import { createConnection } from "typeorm"; export const c = createConnection({ type: "postgres", logging: [\'error\', \'warn\'] });',
      FORM.logging,
    ),
    fixed(
      'import { TypeOrmModule } from "@nestjs/typeorm"; export const m = TypeOrmModule.forRoot({ type: "postgres", logging: true });',
      'import { TypeOrmModule } from "@nestjs/typeorm"; export const m = TypeOrmModule.forRoot({ type: "postgres", logging: [\'error\', \'warn\'] });',
      FORM.logging,
    ),
    fixed(
      sequelizeOptions('logging: console.log'),
      sequelizeOptions('logging: false'),
      FORM.logging,
    ),
    fixed(
      sequelizeOptions('logging: (sql) => logger.info(sql)'),
      sequelizeOptions('logging: false'),
      FORM.logging,
    ),
    fixed(
      sequelizeOptions('logging: (sql) => { console.log(sql); }'),
      sequelizeOptions('logging: false'),
      FORM.logging,
    ),
    fixed(
      sequelizeOptions('logging: false, logQueryParameters: true'),
      sequelizeOptions('logging: false, logQueryParameters: false'),
      FORM.parameters,
    ),
    fixed(
      `${SEQUELIZE} export const db = new Sequelize(process.env.DATABASE_URL);`,
      `${SEQUELIZE} export const db = new Sequelize(process.env.DATABASE_URL, { logging: false });`,
      FORM.sequelize,
    ),
    fixed(
      `${SEQUELIZE} export const db = new Sequelize("postgres://db/app");`,
      `${SEQUELIZE} export const db = new Sequelize("postgres://db/app", { logging: false });`,
      FORM.sequelize,
    ),
    fixed(
      `${SEQUELIZE} export const db = new Sequelize("app", "user", password);`,
      `${SEQUELIZE} export const db = new Sequelize("app", "user", password, { logging: false });`,
      FORM.sequelize,
    ),
    fixed(
      sequelizeOptions('dialect: "postgres", pool: { max: 5 }'),
      sequelizeOptions('dialect: "postgres", pool: { max: 5 }, logging: false'),
      FORM.sequelize,
    ),
    fixed(
      `${SEQUELIZE} export const db = new Sequelize({ dialect: "postgres" });`,
      `${SEQUELIZE} export const db = new Sequelize({ dialect: "postgres", logging: false });`,
      FORM.sequelize,
    ),
    fixed(
      'import { Sequelize as SQ } from "@sequelize/core"; export const db = new SQ("postgres://db/app");',
      'import { Sequelize as SQ } from "@sequelize/core"; export const db = new SQ("postgres://db/app", { logging: false });',
      FORM.sequelize,
    ),
    fixed(
      `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", models: [User] });`,
      `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", models: [User], logging: false });`,
      FORM.nest,
    ),
    fixed(
      `${NEST_SEQUELIZE} export const m = SequelizeModule.forRootAsync({ useFactory: () => ({ dialect: "postgres", autoLoadModels: false }) });`,
      `${NEST_SEQUELIZE} export const m = SequelizeModule.forRootAsync({ useFactory: () => ({ dialect: "postgres", autoLoadModels: false, logging: false }) });`,
      FORM.async,
    ),
    fixed(
      `${NEST_SEQUELIZE} export const m = SequelizeModule.forRootAsync({ useFactory: async () => { return { dialect: "postgres" }; } });`,
      `${NEST_SEQUELIZE} export const m = SequelizeModule.forRootAsync({ useFactory: async () => { return { dialect: "postgres", logging: false }; } });`,
      FORM.async,
    ),
    fixed(mikro('debug: true'), mikro('debug: false'), FORM.debug),
    fixed(mikro('debug: ["query", "query-params"]'), mikro('debug: false'), FORM.debug),
    fixed(mikro('debug: ["discovery", "query"]'), mikro('debug: ["discovery"]'), FORM.debug),
    fixed(
      `${MIKRO} export const orm = MikroORM.init({ dbName: "app", debug: ["info", "query-params"] });`,
      `${MIKRO} export const orm = MikroORM.init({ dbName: "app", debug: ["info"] });`,
      FORM.debug,
    ),
    fixed(prisma('log: ["query", "error"]'), prisma('log: ["error"]'), FORM.log),
    fixed(
      prisma('log: [{ emit: "stdout", level: "query" }, "warn"]'),
      prisma('log: ["warn"]'),
      FORM.log,
    ),
    fixed(prisma('log: [{ level: "query" }]'), prisma('log: []'), FORM.log),
    fixed(
      prisma('log: [{ emit: "event", level: "query" }, "query", "warn"]'),
      prisma('log: [{ emit: "event", level: "query" }, "warn"]'),
      FORM.log,
    ),
    fixed(
      `${PRISMA} export class Db extends PrismaClient { constructor() { super({ log: ["query", "info"] }); } }`,
      `${PRISMA} export class Db extends PrismaClient { constructor() { super({ log: ["info"] }); } }`,
      FORM.log,
    ),
    fixed(
      `${DRIZZLE} export const db = drizzle(pool, { logger: true });`,
      `${DRIZZLE} export const db = drizzle(pool, { logger: false });`,
      FORM.logger,
    ),
    fixed(
      `${DRIZZLE_LOGGER} export const db = drizzle(pool, { logger: new DefaultLogger() });`,
      `${DRIZZLE_LOGGER} export const db = drizzle(pool, { logger: false });`,
      FORM.logger,
    ),
  ],
});

typescriptRuleTester().run('no-orm-query-logging suggestion declined', rule, {
  valid: [],
  invalid: [
    declined(typeorm('logging: process.env.DB_LOG === "1"'), FORM.logging),
    declined(typeorm('logging: isDev ? ["query"] : false'), FORM.logging),
    declined(typeorm('logging: ["query", ...extra]'), FORM.logging),
    declined(typeorm('logging: [/* all */ "query"]'), FORM.logging),
    declined(typeorm('logging: console.log'), FORM.logging),
    declined(typeorm('...base, logging: true'), FORM.logging),
    declined(typeorm('logQueryParameters: process.env.DB_PARAMS === "1"'), FORM.parameters),
    declined(
      `${TYPEORM} const shared = { type: "postgres", logging: true }; export const db = new DataSource(shared);`,
      FORM.logging,
    ),
    declined('export default { type: "mysql", entities: ["a"], logging: true };', FORM.logging),
    declined(sequelizeOptions('logging: isDev ? console.log : false'), FORM.logging),
    declined(sequelizeOptions('logging: (sql) => logger.debug(sql)'), FORM.logging),
    declined(sequelizeOptions('logging: console.debug'), FORM.logging),
    declined(sequelizeOptions('logging: (sql) => console.trace(sql)'), FORM.logging),
    declined(sequelizeOptions('logging: (sql) => { logger.verbose(sql); }'), FORM.logging),
    declined(
      sequelizeOptions('logging: (sql, ms) => { metrics.observe(ms); logger.debug(sql); }'),
      FORM.logging,
    ),
    declined(
      sequelizeOptions('logging: (sql) => { metrics.count(); logger.debug(sql); }'),
      FORM.logging,
    ),
    declined(
      `${NEST_SEQUELIZE} export const m = SequelizeModule.forRootAsync({ useFactory: () => { if (a) { return { dialect: "x" }; } return { dialect: "y" }; } });`,
      FORM.async,
    ),
    declined(mikro('debug: process.env.DEBUG === "1"'), FORM.debug),
    declined(prisma('log: isDev ? ["query"] : []'), FORM.log),
    declined(prisma('log: ["query", level]'), FORM.log),
    declined(prisma('log: [{ ...entry, level: "query" }]'), FORM.log),
    declined(
      `${PRISMA} export const prisma = new PrismaClient({ ...base, log: ["query"] });`,
      FORM.log,
    ),
    declined(
      `${PRISMA} export const prisma = new PrismaClient({ ...x, log: ["query"] });`,
      FORM.log,
    ),
    declined(
      `${DRIZZLE_LOGGER} export const db = drizzle(pool, { logger: new DefaultLogger({ writer }) });`,
      FORM.logger,
    ),
    declined(
      `${DRIZZLE} export const db = drizzle(pool, { logger: process.env.SQL_LOG === "1" });`,
      FORM.logger,
    ),
  ],
});
