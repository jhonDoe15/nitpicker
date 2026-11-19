import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-orm-schema-sync.mts';

const tester = typescriptRuleTester();
const sync = (form: string) => [{ messageId: 'schemaSync', data: { form } }];
function flagged(code: string, form: string) {
  return { code, errors: sync(form) };
}
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
    `${SEQUELIZE} import { rimraf } from "rimraf"; export const clean = (p) => rimraf.sync(p);`,
    `${SEQUELIZE} const glob = require("glob"); export const files = glob.sync("*.ts");`,
    `${SEQUELIZE} import { store } from "./store.js"; export async function start(cache) { await store.sync(); await cache.sync(); }`,
    `${SEQUELIZE} import { Pool } from "pg"; export async function start(pool) { await pool.sync(); }`,
    `${TYPEORM} export async function start(redisClient) { await redisClient.synchronize(); }`,
    'export const flags = { synchronize: true, items: [] };',
    `${NEST_TYPEORM} export const m = TypeOrmModule.forRootAsync({ useFactory: () => ({ type: "postgres", synchronize: false }) });`,
  ],
  invalid: [
    flagged(
      `${TYPEORM} export const db = new DataSource({ type: "postgres", synchronize: true });`,
      'synchronize: true',
    ),
    flagged(
      'export default { type: "mysql", host, entities: ["dist/**/*.entity.js"], synchronize: true };',
      'synchronize: true',
    ),
    flagged(
      `${NEST_TYPEORM} export const m = TypeOrmModule.forRoot({ type: "postgres", autoLoadEntities: true, synchronize: process.env.NODE_ENV !== "production" });`,
      'synchronize: process.env.NODE_ENV !== "production"',
    ),
    {
      code: `${TYPEORM} const SYNC = true; export const options = { type: "postgres", synchronize: SYNC, dropSchema: !isProduction };`,
      errors: [...sync('synchronize: SYNC'), ...sync('dropSchema: !isProduction')],
    },
    flagged(
      `${TYPEORM} export const options = { type: "sqlite", synchronize: process.env.DB_SYNC };`,
      'synchronize: process.env.DB_SYNC',
    ),
    flagged(
      `${TYPEORM} export async function start(dataSource) { await dataSource.synchronize(); }`,
      'dataSource.synchronize()',
    ),
    flagged(
      `${TYPEORM} export async function reset(dataSource) { await dataSource.dropDatabase(); }`,
      'dataSource.dropDatabase()',
    ),
    flagged(
      `${SEQUELIZE} export async function start(sequelize) { await sequelize.sync({ alter: true }); }`,
      'sequelize.sync()',
    ),
    flagged(
      `${SEQUELIZE} export async function start(sequelize) { await sequelize.sync({ force: true }); }`,
      'sequelize.sync()',
    ),
    flagged(
      'const { Sequelize } = require("sequelize"); const db = new Sequelize(url); module.exports = async () => { await db.sync(); };',
      'db.sync()',
    ),
    flagged(
      'import { Sequelize as SQ } from "@sequelize/core"; const db = new SQ(url); export const start = () => db.sync({ alter: true });',
      'db.sync()',
    ),
    flagged(
      `${SEQUELIZE} class User extends Model {} export const start = () => User.sync();`,
      'User.sync()',
    ),
    flagged(
      `${NEST_TYPEORM} export const m = TypeOrmModule.forRootAsync({ useFactory: (config) => ({ autoLoadEntities: true, synchronize: Boolean(config.get("DB_SYNC")) }) });`,
      'synchronize: Boolean(config.get("DB_SYNC"))',
    ),
    flagged(
      `${NEST_TYPEORM} export const m = TypeOrmModule.forRootAsync({ useFactory: (config) => { return { url: config.get("URL"), synchronize: true }; } });`,
      'synchronize: true',
    ),
    flagged(
      `${TYPEORM} const dataSource = new DataSource(options); export const start = () => dataSource.synchronize();`,
      'dataSource.synchronize()',
    ),
    flagged(
      'export async function start(app) { await app.sequelize.sync(); }',
      'app.sequelize.sync()',
    ),
    flagged(
      `import { User } from "./models/user.js"; ${SEQUELIZE} export async function start() { await User.sync(); }`,
      'User.sync()',
    ),
    flagged(
      `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", autoLoadModels: true });`,
      'autoLoadModels: true` without `synchronize: false',
    ),
    flagged(
      `${NEST_SEQUELIZE} export const m = SequelizeModule.forRoot({ dialect: "postgres", autoLoadModels: true, synchronize: true });`,
      'synchronize: true',
    ),
    flagged(
      `${MIKRO} export async function start(orm) { await orm.schema.updateSchema(); }`,
      'orm.schema.updateSchema()',
    ),
    flagged(
      `${MIKRO} export async function start(orm) { await orm.getSchemaGenerator().createSchema(); }`,
      'orm.getSchemaGenerator().createSchema()',
    ),
    flagged(
      `${MIKRO} export async function start(orm) { await orm.schema.refreshDatabase(); }`,
      'orm.schema.refreshDatabase()',
    ),
    flagged(
      `${MIKRO} export async function start(orm) { await orm.schema.ensureDatabase({ create: true }); }`,
      'orm.schema.ensureDatabase()',
    ),
    flagged(
      `${TYPEORM} import { dataSource } from "typeorm"; export async function start() { await dataSource.synchronize(true); }`,
      'dataSource.synchronize()',
    ),
    flagged(
      `${SEQUELIZE} export async function start() { await Sequelize.sync({ alter: true }); }`,
      'Sequelize.sync()',
    ),
  ],
});
