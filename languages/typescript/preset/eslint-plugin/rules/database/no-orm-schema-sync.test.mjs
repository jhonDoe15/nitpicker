import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule } from './no-orm-schema-sync.mjs';

const tester = createRuleTester();
const sync = (form) => [{ messageId: 'schemaSync', data: { form } }];
const TYPEORM = 'import { DataSource } from "typeorm";';
const NEST_TYPEORM = 'import { TypeOrmModule } from "@nestjs/typeorm";';
const SEQUELIZE = 'import { Sequelize } from "sequelize";';
const NEST_SEQUELIZE = 'import { SequelizeModule } from "@nestjs/sequelize";';
const MIKRO = 'import { MikroORM } from "@mikro-orm/postgresql";';

tester.run('no-orm-schema-sync', rule, {
  valid: [
    `${TYPEORM} export const db = new DataSource({ type: "postgres", synchronize: false, migrationsRun: true, migrations: ["dist/migrations/*.js"] });`,
    `${TYPEORM} export const db = new DataSource({ type: "postgres", entities, migrations });`,
    `${NEST_TYPEORM} export const m = TypeOrmModule.forRootAsync({ useFactory: (config) => ({ type: "postgres", synchronize: config.get("DB_SYNC") }) });`,
    'export const options = { synchronize: true };',
    'export const state = { dropSchema: true, items: [] };',
    `${SEQUELIZE} import glob from "glob"; export const files = glob.sync("models/*.js");`,
    `${SEQUELIZE} const fg = require("fast-glob"); export const files = fg.sync(["*.ts"]);`,
    'export async function start(store) { await store.sync(); }',
    `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", autoLoadModels: true, synchronize: false });`,
    `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", models: [User] });`,
    `${NEST_SEQUELIZE} export const m = (base) => SequelizeModule.forRoot({ ...base, autoLoadModels: true });`,
    `${MIKRO} export async function start(orm) { await orm.migrator.up(); }`,
    `${MIKRO} export async function start(orm) { await orm.schema.ensureDatabase(); }`,
    'export async function start(generator) { await generator.updateSchema(); }',
    `${TYPEORM} export async function start(db) { await db.runMigrations(); }`,
  ],
  invalid: [
    {
      code: `${TYPEORM} export const db = new DataSource({ type: "postgres", synchronize: true });`,
      errors: sync('synchronize: true'),
    },
    {
      code: 'export default { type: "mysql", host, entities: ["dist/**/*.entity.js"], synchronize: true };',
      errors: sync('synchronize: true'),
    },
    {
      code: `${NEST_TYPEORM} export const m = TypeOrmModule.forRoot({ type: "postgres", autoLoadEntities: true, synchronize: process.env.NODE_ENV !== "production" });`,
      errors: sync('synchronize: true'),
    },
    {
      code: `${TYPEORM} const SYNC = true; export const options = { type: "postgres", synchronize: SYNC, dropSchema: !isProduction };`,
      errors: [...sync('synchronize: true'), ...sync('dropSchema: true')],
    },
    {
      code: `${TYPEORM} export const options = { type: "sqlite", synchronize: process.env.DB_SYNC };`,
      errors: sync('synchronize: true'),
    },
    {
      code: `${TYPEORM} export async function start(dataSource) { await dataSource.synchronize(); }`,
      errors: sync('dataSource.synchronize()'),
    },
    {
      code: `${TYPEORM} export async function reset(dataSource) { await dataSource.dropDatabase(); }`,
      errors: sync('dataSource.dropDatabase()'),
    },
    {
      code: `${SEQUELIZE} export async function start(sequelize) { await sequelize.sync({ alter: true }); }`,
      errors: sync('sequelize.sync()'),
    },
    {
      code: `${SEQUELIZE} export async function start(sequelize) { await sequelize.sync({ force: true }); }`,
      errors: sync('sequelize.sync()'),
    },
    {
      code: 'const { Sequelize } = require("sequelize"); module.exports = async (db) => { await db.sync(); };',
      errors: sync('db.sync()'),
    },
    {
      code: 'export async function start(app) { await app.sequelize.sync(); }',
      errors: sync('app.sequelize.sync()'),
    },
    {
      code: `import { User } from "./models/user.js"; ${SEQUELIZE} export async function start() { await User.sync(); }`,
      errors: sync('User.sync()'),
    },
    {
      code: `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", autoLoadModels: true });`,
      errors: sync('autoLoadModels: true` without `synchronize: false'),
    },
    {
      code: `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", autoLoadModels: true, synchronize: true });`,
      errors: sync('synchronize: true'),
    },
    {
      code: `${MIKRO} export async function start(orm) { await orm.schema.updateSchema(); }`,
      errors: sync('orm.schema.updateSchema()'),
    },
    {
      code: `${MIKRO} export async function start(orm) { await orm.getSchemaGenerator().createSchema(); }`,
      errors: sync('orm.getSchemaGenerator().createSchema()'),
    },
    {
      code: `${MIKRO} export async function start(orm) { await orm.schema.refreshDatabase(); }`,
      errors: sync('orm.schema.refreshDatabase()'),
    },
    {
      code: `${MIKRO} export async function start(orm) { await orm.schema.ensureDatabase({ create: true }); }`,
      errors: sync('orm.schema.ensureDatabase()'),
    },
  ],
});
