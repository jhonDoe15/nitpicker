import { createRuleTester } from '../../guards/test-support/rule-tester.mjs';
import { rule, taggedForm } from './no-sql-string-building.mjs';

const tester = createRuleTester();
const built = (kind, library) => [
  { messageId: 'sqlBuilt', data: { kind, tagged: taggedForm(library) } },
];
const template = built('a template literal');
const concatenation = built('concatenation');
const script = (code) => ({ code, filename: 'src/db.js' });

tester.run('no-sql-string-building on prose and builders', rule, {
  valid: [
    'export const label = (dir: string) => `Showing files and folders in ${dir}`;',
    'export const m = (folder: string) => `Click on items in ${folder} to open them`;',
    'export const m = (limit: string) => `Exceeded the rate limit ${limit}`;',
    'export const m = (list: string) => `Pick one or more in ${list}`;',
    'export const m = (field: string) => `Sorted in ascending order by ${field}`;',
    'export const e = (key: string) => new Error(`No entry where key = ${key}`);',
    'export const e = (offset: number, source: string) => { throw new Error(`offset is longer than source length! offset ${offset} > length ${source.length}`); };',
    'export const trace = (logger: any, id: string) => logger.debug(`running SELECT * FROM users WHERE id = ${id}`);',
    {
      code: 'export const C = ({ dir }: { dir: string }) => <p>{`Files and folders in ${dir}`}</p>;',
      filename: 'src/view.tsx',
    },
    'export function find(db: any, name?: string, age?: number) { const conditions: string[] = []; const params: unknown[] = []; if (name) { conditions.push("name = ?"); params.push(name); } if (age) { conditions.push("age = ?"); params.push(age); } let sql = "SELECT * FROM users"; if (conditions.length > 0) { sql += " WHERE " + conditions.join(" AND "); } return db.query(sql, params); }',
    'export function find(db: any, name?: string) { const where: string[] = []; const values: unknown[] = []; if (name) { values.push(name); where.push(`name = $${values.length}`); } const clause = where.length ? `WHERE ${where.join(" AND ")}` : ""; return db.query(`SELECT * FROM users ${clause}`, values); }',
    'export const f = (knex: any, values: string[][]) => knex.raw(`INSERT INTO t (a, b) VALUES ${values.map(() => "(?, ?)").join(", ")}`, values.flat());',
    'export const many = (db: any, ids: string[]) => db.all(`SELECT * FROM users WHERE id IN (${"?,".repeat(ids.length).slice(0, -1)})`, ids);',
    'export const many = (db: any, ids: string[]) => db.all(`SELECT * FROM users WHERE id IN (${new Array(ids.length).fill("?").join(", ")})`, ids);',
    'export const many = (db: any, ids: string[]) => db.all(`SELECT * FROM users WHERE id IN (${Array.from(ids, () => "?").join(",")})`, ids);',
    'export const many = (pool: any, ids: number[]) => pool.query(`SELECT * FROM users WHERE id IN (${ids.map(Number).join(",")})`);',
    'const COLUMNS = { name: "name", email: "email" } as const; export function update(pool: any, id: string, fields: any) { const keys = Object.keys(fields) as (keyof typeof COLUMNS)[]; const set = keys.map((k, i) => `${COLUMNS[k]} = $${i + 1}`).join(", "); return pool.query(`UPDATE users SET ${set} WHERE id = $${keys.length + 1}`, [...keys.map((k) => fields[k]), id]); }',
    'export async function up(pool: any) { for (const table of ["users", "orders"] as const) { await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`); } }',
    'const TABLES = ["users", "orders"]; export async function up(pool: any) { for (const table of TABLES) { await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`); } }',
    'export const f = (qb: any, alias: string, tenantId: string) => qb.where(`${alias}.tenant_id = :tenantId`, { tenantId });',
    'export const f = (qb: any, alias: string) => qb.orderBy(`${alias}.created_at`, "DESC");',
    'export const f = (knex: any, name: string) => knex("users").whereRaw("name = ?", [name]);',
    script(
      'const COLUMNS = { name: "name", created: "created_at" }; export const f = (pool, key) => pool.query(`SELECT * FROM users ORDER BY ${COLUMNS[key]}`);',
    ),
    script(
      'const TABLES = ["users", "orders"]; export async function up(pool) { for (const table of TABLES) { await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`); } }',
    ),
    script(
      'export function page(pool, params, size) { return pool.query(`SELECT * FROM users WHERE org = $1 LIMIT $${params.length + 1}`, [...params, size]); }',
    ),
    script(
      'const TABLES = Object.freeze({ users: "users" }); export const find = (pool, id) => pool.query(`SELECT * FROM ${TABLES.users} WHERE id = $1`, [id]);',
    ),
    script(
      'export function find(db, name) { const conditions = []; if (name) { conditions.push("name = ?"); } return db.query(`SELECT * FROM users WHERE ${conditions.join(" AND ")}`, [name]); }',
    ),
    'const ALLOWED = new Set(["name", "created_at"]); export function f(pool: any, column: string) { if (!ALLOWED.has(column)) { throw new Error(column); } return pool.query(`SELECT * FROM users ORDER BY ${column}`); }',
    'const ORDER = ["asc", "desc"] as const; export function f(pool: any, order: string) { if (!ORDER.includes(order as never)) return undefined; return pool.query(`SELECT * FROM users ORDER BY name ${order}`); }',
    'const ALLOWED = ["name", "email"]; export function f(pool: any, column: string) { if (ALLOWED.includes(column)) { return pool.query(`SELECT ${column} FROM users`); } return undefined; }',
  ],
  invalid: [
    {
      code: 'const ALLOWED = new Set(["name"]); export function f(pool: any, column: string) { if (!ALLOWED.has(column)) { console.log(column); } return pool.query(`SELECT * FROM users ORDER BY ${column}`); }',
      errors: template,
    },
    {
      code: 'export function f(pool: any, column: string, allowed: Set<string>) { if (!allowed.has(column)) { throw new Error(column); } return pool.query(`SELECT * FROM users ORDER BY ${column}`); }',
      errors: template,
    },
    {
      code: 'const ALLOWED = new Set(["name"]); export function f(pool: any, column: string, other: string) { if (!ALLOWED.has(other)) { throw new Error(other); } return pool.query(`SELECT * FROM users ORDER BY ${column}`); }',
      errors: template,
    },
    {
      code: 'export function find(db: any, name: string) { const conditions: string[] = []; conditions.push(`name = \'${name}\'`); return db.query("SELECT * FROM users WHERE " + conditions.join(" AND ")); }',
      errors: concatenation,
    },
    {
      code: 'export function find(db: any, conditions: string[]) { return db.query("SELECT * FROM users WHERE " + conditions.join(" AND ")); }',
      errors: concatenation,
    },
    {
      code: 'export const many = (pool: any, ids: string[]) => pool.query(`SELECT * FROM users WHERE id IN (${ids.map((id) => `\'${id}\'`).join(",")})`);',
      errors: template,
    },
    {
      code: 'export async function up(pool: any, tables: string[]) { for (const table of tables) { await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`); } }',
      errors: template,
    },
    {
      code: 'export const f = (pool: any, key: string, extra: string) => { const COLUMNS = { name: "name", other: extra }; return pool.query(`SELECT * FROM users ORDER BY ${COLUMNS[key]}`); };',
      errors: template,
    },
    {
      code: "export const f = (knex: any, name: string) => knex('users').whereRaw(`name = '${name}'`);",
      errors: template,
    },
    {
      code: 'export const f = (knex: any, col: string) => knex("users").orderByRaw(`${col} desc`);',
      errors: template,
    },
    {
      code: "export const f = (repo: any, name: string) => repo.createQueryBuilder('user').where(`user.name = '${name}'`).getMany();",
      errors: template,
    },
    {
      code: "export const f = (qb: any, name: string) => qb.where(`user.name = '${name}'`).getMany();",
      errors: template,
    },
    {
      code: 'export const f = (qb: any, email: string) => qb.andWhere("user.email = \'" + email + "\'");',
      errors: concatenation,
    },
    {
      code: 'export const f = (qb: any, sort: string) => qb.orderBy(`user.${sort}`);',
      errors: template,
    },
    {
      code: 'import { Sequelize } from "sequelize"; export const f = (col: string) => Sequelize.literal(`${col} + 1`);',
      errors: template,
    },
    {
      code: "import { sql } from 'drizzle-orm'; export const f = (name: string) => sql.raw(`name = '${name}'`);",
      errors: template,
    },
    {
      code: "export const f = (db: any, name: string, id: number) => db.none(`update users set name = '${name}' where id = $1`, [id]);",
      errors: template,
    },
    {
      code: "export const f = (db: any, msg: string) => db.any(`insert into logs (msg) values ('${msg}')`);",
      errors: template,
    },
    {
      code: 'export const f = (db: any, msg: string) => { const q = "insert into logs (msg) values (\'" + msg + "\')"; return db.oneOrNone(q); };',
      errors: concatenation,
    },
    {
      code: 'declare const pool: any; export const f = async (t: string) => pool.query(`select * from ${t}` as string);',
      errors: template,
    },
    {
      code: 'declare const pool: any; export const f = async (t: string) => pool.query(`select * from ${t}`!);',
      errors: template,
    },
    {
      code: 'declare const pool: any; export const f = async (t: string) => pool.query(`select * from ${t}` satisfies string);',
      errors: template,
    },
    {
      code: 'export const f = (id: string) => `WHERE id = ${id}`;',
      errors: template,
    },
    {
      code: 'export const f = (id: string) => `SELECT * FROM users WHERE id = ${id}`;',
      options: [{ sqlLibrary: 'drizzle-orm' }],
      errors: built('a template literal', 'drizzle-orm'),
    },
    script(
      'export function find(db, name) { const conditions = []; conditions.push(name); return db.query(`SELECT * FROM users WHERE ${conditions.join(" AND ")}`); }',
    ),
  ].map((entry) => (entry.errors === undefined ? { ...entry, errors: template } : entry)),
});
