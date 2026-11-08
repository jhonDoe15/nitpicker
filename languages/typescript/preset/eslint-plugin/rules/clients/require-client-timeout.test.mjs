import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule } from './require-client-timeout.mjs';

const tester = createRuleTester();
const database = (client) => [{ messageId: 'database', data: { client } }];
const aws = (client) => [{ messageId: 'aws', data: { client } }];
const S3 = 'import { S3Client } from "@aws-sdk/client-s3";';
const HANDLER = 'import { NodeHttpHandler } from "@smithy/node-http-handler";';
const PG = 'import { Pool, Client } from "pg";';
const TYPEORM = 'import { DataSource } from "typeorm";';
const NEST = 'import { TypeOrmModule } from "@nestjs/typeorm";';
const SEQUELIZE = 'import { Sequelize } from "sequelize";';

tester.run('require-client-timeout', rule, {
  valid: [
    `${S3} export const s3 = new S3Client({ requestHandler: { requestTimeout: 30_000, connectionTimeout: 5_000 } });`,
    `${S3} ${HANDLER} export const s3 = new S3Client({ requestHandler: new NodeHttpHandler({ requestTimeout: 30_000 }) });`,
    `${S3} ${HANDLER} const handler = NodeHttpHandler.create({ socketTimeout: 30_000 }); export const s3 = new S3Client({ requestHandler: handler });`,
    `${S3} import { awsHandler } from "./aws.js"; export const s3 = new S3Client({ region: "eu-west-1", requestHandler: awsHandler() });`,
    `${S3} export const s3 = (config) => new S3Client(config);`,
    `${S3} import { base } from "./aws.js"; export const s3 = new S3Client({ ...base, region: "eu-west-1" });`,
    `${S3} const SHARED = { requestHandler: { requestTimeout: 10_000 } }; export const s3 = new S3Client({ ...SHARED, region: "eu-west-1" });`,
    'import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"; export const doc = (client) => DynamoDBDocumentClient.from(client);',
    `${PG} export const pool = new Pool({ connectionString: process.env.DATABASE_URL, statement_timeout: 30_000 });`,
    `${PG} export const client = new Client({ query_timeout: 30_000 });`,
    `${PG} export const pool = new Pool({ options: "-c statement_timeout=30000" });`,
    `${PG} export const pool = new Pool({ connectionString: "postgres://db/app?statement_timeout=30000" });`,
    `${PG} export const pool = (config) => new Pool(config);`,
    `${PG} import { dbOptions } from "./db.js"; export const pool = new Pool(dbOptions());`,
    'import pg from "pg"; export const pool = new pg.Pool({ statement_timeout: 30_000 });',
    'const { Pool } = require("pg"); module.exports = new Pool({ statement_timeout: 30_000 });',
    'import { Pool } from "./pool.js"; export const pool = new Pool();',
    'import postgres from "postgres"; export const sql = postgres(process.env.URL, { connection: { statement_timeout: 30_000 } });',
    'import postgres from "postgres"; export const sql = (options) => postgres(process.env.URL, options);',
    `${TYPEORM} export const db = new DataSource({ type: "postgres", extra: { statement_timeout: 30_000 } });`,
    `${TYPEORM} export const db = new DataSource({ type: "postgres", extra: { options: "-c statement_timeout=30s" } });`,
    `${TYPEORM} export const db = new DataSource({ type: "sqlite", database: "app.db" });`,
    `${TYPEORM} export const db = (type) => new DataSource({ type, entities: [] });`,
    `${TYPEORM} const BASE = { type: "postgres", entities: [] }; export const db = new DataSource({ ...BASE, extra: { statement_timeout: 30_000 } });`,
    `${NEST} export const m = TypeOrmModule.forRootAsync({ useFactory: (config) => ({ type: "postgres", extra: { statement_timeout: config.get("DB_TIMEOUT") } }) });`,
    `${NEST} export const m = TypeOrmModule.forRootAsync({ useFactory: (config) => ({ type: "postgres", ...config.get("db") }) });`,
    `${SEQUELIZE} export const db = new Sequelize({ dialect: "postgres", dialectOptions: { statement_timeout: 30_000 } });`,
    `${SEQUELIZE} export const db = new Sequelize("postgres://db/app", { dialectOptions: { query_timeout: 30_000 } });`,
    `${SEQUELIZE} export const db = new Sequelize("sqlite::memory:");`,
    'import knex from "knex"; export const db = knex({ client: "pg", connection: { connectionString: process.env.URL, statement_timeout: 30_000 } });',
    'import knex from "knex"; export const db = knex({ client: "pg", connection: process.env.URL, pool: { afterCreate: (conn, done) => conn.query("SET statement_timeout = 30000", done) } });',
    'import knex from "knex"; export const db = knex({ client: "mysql2", connection: process.env.URL });',
    'export const theme = { type: "postgres", label: "Postgres" };',
  ],
  invalid: [
    {
      code: `${S3} export const s3 = new S3Client({ region: "eu-west-1" });`,
      errors: aws('S3Client'),
    },
    { code: `${S3} export const s3 = new S3Client();`, errors: aws('S3Client') },
    {
      code: `${S3} ${HANDLER} export const s3 = new S3Client({ requestHandler: new NodeHttpHandler({ connectionTimeout: 5_000 }) });`,
      errors: aws('S3Client'),
    },
    {
      code: `${S3} export const s3 = new S3Client({ requestHandler: { requestTimeout: 0 } });`,
      errors: aws('S3Client'),
    },
    {
      code: 'import * as lambda from "@aws-sdk/client-lambda"; export const fn = new lambda.LambdaClient({});',
      errors: aws('LambdaClient'),
    },
    {
      code: `${PG} export const pool = new Pool({ connectionString: process.env.DATABASE_URL });`,
      errors: database('pg Pool'),
    },
    { code: `${PG} export const pool = new Pool();`, errors: database('pg Pool') },
    {
      code: `${PG} export const client = new Client(process.env.DATABASE_URL);`,
      errors: database('pg Client'),
    },
    {
      code: `${PG} export const pool = new Pool({ connectionString: "postgres://db/app", statement_timeout: 0 });`,
      errors: database('pg Pool'),
    },
    {
      code: 'import pg from "pg"; const CONFIG = { max: 10 }; export const pool = new pg.Pool(CONFIG);',
      errors: database('pg Pool'),
    },
    {
      code: 'import Pool from "pg-pool"; export const pool = new Pool({ max: 10 });',
      errors: database('pg Pool'),
    },
    {
      code: 'import postgres from "postgres"; export const sql = postgres(process.env.URL);',
      errors: database('postgres()'),
    },
    {
      code: 'import postgres from "postgres"; export const sql = postgres({ host: "db", connection: { application_name: "api" } });',
      errors: database('postgres()'),
    },
    {
      code: `${TYPEORM} export const db = new DataSource({ type: "postgres", url: process.env.URL, entities: [] });`,
      errors: database('TypeORM'),
    },
    {
      code: `${NEST} export const m = TypeOrmModule.forRootAsync({ useFactory: (config) => ({ type: "postgres", url: config.get("DB_URL") }) });`,
      errors: database('TypeORM'),
    },
    {
      code: 'export default { type: "postgres", entities: ["dist/**/*.entity.js"], migrations: [] };',
      errors: database('TypeORM'),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize({ dialect: "postgres", dialectOptions: { ssl: true } });`,
      errors: database('Sequelize'),
    },
    {
      code: `${SEQUELIZE} export const db = new Sequelize("postgres://db/app");`,
      errors: database('Sequelize'),
    },
    {
      code: 'import knex from "knex"; export const db = knex({ client: "pg", connection: process.env.URL });',
      errors: database('Knex'),
    },
  ],
});
