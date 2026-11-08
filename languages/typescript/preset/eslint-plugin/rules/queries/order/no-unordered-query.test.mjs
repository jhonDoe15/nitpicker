import { createRuleTester } from '../../guards/test-support/rule-tester.mjs';
import { rule } from './no-unordered-query.mjs';

const tester = createRuleTester();
const page = (form) => [{ messageId: 'page', data: { form } }];
const aggregate = (form) => [{ messageId: 'aggregate', data: { form } }];
const KYSELY = 'import { Kysely, sql } from "kysely";';
const HELPERS = 'import { jsonArrayFrom } from "kysely/helpers/postgres";';
const KNEX = 'import knex from "knex";';
const DRIZZLE = 'import { eq } from "drizzle-orm";';
const TYPEORM = 'import { Repository } from "typeorm";';
const SEQUELIZE = 'import { Model } from "sequelize";';

tester.run('no-unordered-query', rule, {
  valid: [
    `${KYSELY} export const f = (db) => db.selectFrom("asset").selectAll().orderBy("createdAt", "desc").orderBy("id").limit(20).execute();`,
    `${KYSELY} export const f = (db, id) => db.selectFrom("user").select(sql\`1\`.as("one")).where("id", "=", id).limit(1).executeTakeFirst();`,
    `${KYSELY} export const f = (db) => db.selectFrom("user").select((eb) => eb.fn.countAll().as("n")).limit(1).executeTakeFirst();`,
    `${KYSELY} export const f = (db) => db.selectFrom("user").selectAll().executeTakeFirst();`,
    `${KYSELY} export async function f(db, sort) { let query = db.selectFrom("asset").selectAll(); if (sort) { query = query.orderBy("id"); } return query.limit(10).execute(); }`,
    `${KYSELY} export async function f(db) { const query = db.selectFrom("asset").selectAll().limit(10); return query.orderBy("id").execute(); }`,
    `${KYSELY} export async function f(db, order) { return db.selectFrom("asset").selectAll().$call(order).limit(10).execute(); }`,
    `${KYSELY} export function paged(query) { return query.limit(10); }`,
    `${KYSELY} export async function f(db) { const query = db.selectFrom("asset").selectAll().limit(10); return withOrder(query).execute(); }`,
    `${KYSELY} export const f = (db) => db.updateTable("asset").set({ a: 1 }).limit(10).execute();`,
    `${KNEX} export const f = (db) => db("users").where({ active: true }).orderBy("id").limit(20);`,
    `${KNEX} export async function f(db) { const query = db("users").limit(20); query.orderBy("id"); return query; }`,
    'export const f = (rows) => rows.slice(0, 10);',
    'export const f = (cursor) => cursor.find({}).limit(10).toArray();',
    `${TYPEORM} export const f = (repo) => repo.createQueryBuilder("u").orderBy("u.id").skip(20).take(10).getMany();`,
    `${TYPEORM} export const f = (repo) => repo.find({ where: { active: true }, order: { id: "ASC" }, take: 10 });`,
    `${DRIZZLE} export const f = (db, users) => db.select().from(users).orderBy(users.id).limit(10);`,
    'export const f = (prisma) => prisma.user.findMany({ orderBy: { id: "asc" }, take: 10, skip: 20 });',
    'export const f = (prisma) => prisma.user.findMany({ where: { active: true } });',
    'export const f = (prisma, page) => prisma.user.findMany({ ...page, take: 10 });',
    'export const f = (prisma, id) => prisma.user.findUnique({ where: { id }, include: { posts: { orderBy: { id: "asc" }, take: 5 } } });',
    'export const f = (store) => store.find({ limit: 10 });',
    `${SEQUELIZE} export const f = (User) => User.findAll({ limit: 10, offset: 20, order: [["id", "ASC"]] });`,
    `${KYSELY} export const f = (db) => sql\`select * from asset order by id limit 20\`.execute(db);`,
    `${KYSELY} export const f = (db, order) => sql\`select * from asset \${sql.raw(order)} limit 20\`.execute(db);`,
    `${KYSELY} export const f = (db) => sql\`select * from asset \${sql.raw("order by id")} limit 20\`.execute(db);`,
    `${KYSELY} export const f = (db, id) => sql\`select 1 from asset where id = \${id} limit 1\`.execute(db);`,
    'export const text = "Set a limit of 20 items";',
    'export const f = (pool) => pool.query("select id from users order by id limit $1", [10]);',
    `${KYSELY} export const f = (eb) => eb.fn.jsonAgg("album").orderBy("album.name").as("albums");`,
    `${KYSELY} export const f = (eb) => sql\`coalesce(json_agg(t order by t.name), '[]')\`;`,
    `${KYSELY}${HELPERS} export const f = (eb) => jsonArrayFrom(eb.selectFrom("tag").selectAll().whereRef("tag.assetId", "=", "asset.id").orderBy("tag.value"));`,
    `${HELPERS} export const f = (eb, sub) => jsonArrayFrom(sub);`,
  ],
  invalid: [
    {
      code: `${KYSELY} export const f = (db) => db.selectFrom("asset").selectAll().limit(20).execute();`,
      errors: page('limit(20)'),
    },
    {
      code: `${KYSELY} export const f = (db, email) => db.selectFrom("user").selectAll().where("email", "=", email).limit(1).executeTakeFirst();`,
      errors: page('limit(1)'),
    },
    {
      code: `${KYSELY} export async function f(db, query) { let builder = db.selectFrom("asset").selectAll(); if (query) { builder = builder.where("name", "=", query); } return builder.offset(40).limit(20).execute(); }`,
      errors: page('offset(40)'),
    },
    {
      code: `${KNEX} export const f = (db, page) => db("users").where({ active: true }).limit(20).offset(page * 20);`,
      errors: page('limit(20)'),
    },
    {
      code: 'export const f = (knex) => knex.select("id").from("users").limit(5);',
      errors: page('limit(5)'),
    },
    {
      code: `${TYPEORM} export const f = (repo) => repo.createQueryBuilder("u").where("u.active").skip(20).take(10).getMany();`,
      errors: page('skip(20)'),
    },
    {
      code: `${DRIZZLE} export const f = (db, users) => db.select().from(users).where(eq(users.active, true)).limit(10);`,
      errors: page('limit(10)'),
    },
    {
      code: 'export const f = (prisma) => prisma.user.findMany({ where: { active: true }, take: 10 });',
      errors: page('take: 10'),
    },
    {
      code: 'export const f = (prisma, after) => prisma.user.findMany({ cursor: { id: after } });',
      errors: page('cursor: { id: after }'),
    },
    {
      code: 'export const f = (prisma, id) => prisma.user.findUnique({ where: { id }, include: { posts: { take: 5 } } });',
      errors: page('take: 5'),
    },
    {
      code: 'export const f = (db) => db.query.users.findMany({ limit: 10, with: { posts: { limit: 3 } } });',
      errors: [...page('limit: 10'), ...page('limit: 3')],
    },
    {
      code: `${TYPEORM} export const f = (repo) => repo.findAndCount({ where: { active: true }, skip: 20, take: 10 });`,
      errors: page('skip: 20'),
    },
    {
      code: `${SEQUELIZE} export const f = (User) => User.findAll({ where: { active: true }, limit: 10 });`,
      errors: page('limit: 10'),
    },
    {
      code: `${KYSELY} export const f = (db, n) => sql\`select * from asset where owner = \${n} limit 20\`.execute(db);`,
      errors: page('LIMIT 20'),
    },
    {
      code: 'export const f = (pool) => pool.query("select id from users limit $1", [10]);',
      errors: page('LIMIT'),
    },
    {
      code: 'export const QUERY = `SELECT id, name FROM place WHERE name ILIKE $1 OFFSET 10`;',
      errors: page('OFFSET 10'),
    },
    {
      code: `${KYSELY} export const f = (eb) => sql\`coalesce(json_agg(t), '[]')\`;`,
      errors: aggregate('json_agg(...)'),
    },
    {
      code: 'export const f = (pool) => pool.query("select a.id, array_agg(t.name) from a join t on t.a = a.id group by a.id");',
      errors: aggregate('array_agg(...)'),
    },
    {
      code: `${KYSELY} export const f = (eb) => eb.fn.jsonAgg("album").as("albums");`,
      errors: aggregate('jsonAgg("album")'),
    },
    {
      code: `${KYSELY} export const f = (eb) => eb.fn.agg("array_agg", ["tag.value"]).as("tags");`,
      errors: aggregate('agg("array_agg", ["tag.value"])'),
    },
    {
      code: `${KYSELY}${HELPERS} export const f = (eb) => jsonArrayFrom(eb.selectFrom("tag").selectAll().whereRef("tag.assetId", "=", "asset.id"));`,
      errors: aggregate('jsonArrayFrom(...)'),
    },
  ],
});
