import { createRuleTester } from '../../guards/test-support/rule-tester.mjs';
import { rule } from './no-unbounded-query-array.mjs';

const tester = createRuleTester();
const inList = (name) => [{ messageId: 'inList', data: { name } }];
const insertRows = (name) => [{ messageId: 'insertRows', data: { name } }];
const KYSELY = 'import { Kysely, sql } from "kysely";';
const KNEX = 'import knex from "knex";';
const DRIZZLE = 'import { inArray } from "drizzle-orm";';
const TYPEORM = 'import { In, Repository } from "typeorm";';

tester.run('no-unbounded-query-array', rule, {
  valid: [
    `${KYSELY} export async function f(db, ids) { if (ids.length === 0) { return []; } return db.selectFrom("asset").selectAll().where("id", "in", ids).execute(); }`,
    `${KYSELY} export const f = (db, ids) => ids.length > 0 ? db.selectFrom("asset").selectAll().where("id", "in", ids).execute() : [];`,
    `${KYSELY} export const f = (db) => db.selectFrom("asset").selectAll().where("status", "in", ["a", "b"]).execute();`,
    `${KYSELY} export const f = (db, ids) => db.selectFrom("asset").selectAll().where("id", "=", sql\`any(\${ids}::uuid[])\`).execute();`,
    `${KYSELY} export const f = (db) => db.selectFrom("asset").selectAll().where("id", "in", db.selectFrom("album").select("assetId")).execute();`,
    `${KYSELY} export const f = (db) => db.selectFrom("asset").selectAll().where("id", "in", (eb) => eb.selectFrom("album").select("assetId")).execute();`,
    `${KYSELY} export async function f(db, ids) { for (const part of chunk(ids, 1000)) { await db.deleteFrom("asset").where("id", "in", part).execute(); } }`,
    `${KYSELY} export const f = (db, ids) => chunked(ids, (part) => db.deleteFrom("asset").where("id", "in", part).execute());`,
    `${KYSELY} export class Repo { @Chunked() async remove(ids) { await this.db.deleteFrom("asset").where("id", "in", ids).execute(); } }`,
    `${KYSELY} export async function f(db, items) { if (items.length === 0) { return; } const ids = items.map((item) => item.id); await db.deleteFrom("asset").where("id", "in", ids).execute(); }`,
    `${KYSELY} export const f = (db, row) => db.insertInto("asset").values(row).execute();`,
    `${KYSELY} export const f = (db, rows) => db.insertInto("asset").values(rows.slice(0, 100)).execute();`,
    `${KYSELY} export async function f(db, rows) { if (!rows.length) { return; } await db.insertInto("asset").values(rows).execute(); }`,
    `${KNEX} export async function f(db, ids) { if (ids.length === 0) { return []; } return db("users").whereIn("id", ids); }`,
    `${KNEX} export const f = (db, rows) => db.batchInsert("users", rows, 500);`,
    'export const f = (list, ids) => list.where("id", "in", ids);',
    `${TYPEORM} export const f = (repo) => repo.findBy({ status: In(["a", "b"]) });`,
    `${DRIZZLE} export async function f(db, users, ids) { if (ids.length === 0) { return []; } return db.select().from(users).where(inArray(users.id, ids)); }`,
  ],
  invalid: [
    {
      code: `${KYSELY} export const f = (db, ids) => db.selectFrom("asset").selectAll().where("id", "in", ids).execute();`,
      errors: inList('ids'),
    },
    {
      code: `${KYSELY} export const f = (db, dto) => db.deleteFrom("asset").where("ownerId", "not in", dto.ownerIds).execute();`,
      errors: inList('dto.ownerIds'),
    },
    {
      code: `${KYSELY} export const f = (db, ids) => db.selectFrom("asset").selectAll().where((eb) => eb("id", "in", ids)).execute();`,
      errors: inList('ids'),
    },
    {
      code: `${KYSELY} export const f = (db, items) => db.insertInto("asset").values(items.map((item) => ({ id: item.id }))).execute();`,
      errors: insertRows('this array'),
    },
    {
      code: `${KYSELY} export const f = (db, rows: Row[]) => db.insertInto("asset").values(rows).execute();`,
      errors: insertRows('rows'),
    },
    {
      code: `${KNEX} export const f = (db, ids) => db("users").whereIn("id", ids);`,
      errors: inList('ids'),
    },
    {
      code: `${KNEX} export const f = (db, users) => db("users").insert(users.map((user) => user.row));`,
      errors: insertRows('users.map((user) => user.row)'),
    },
    {
      code: `${TYPEORM} export const f = (repo, ids) => repo.findBy({ id: In(ids) });`,
      errors: inList('ids'),
    },
    {
      code: `${TYPEORM} export const f = (repo, rows: Row[]) => repo.insert(rows);`,
      errors: insertRows('rows'),
    },
    {
      code: `${DRIZZLE} export const f = (db, users, ids) => db.select().from(users).where(inArray(users.id, ids));`,
      errors: inList('ids'),
    },
    {
      code: `${DRIZZLE} export const f = (db, users, rows: NewUser[]) => db.insert(users).values(rows);`,
      errors: insertRows('rows'),
    },
  ],
});
