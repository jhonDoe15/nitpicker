import { createRuleTester } from '../../guards/test-support/rule-tester.mjs';
import { rule as noSqlStringBuilding } from './no-sql-string-building.mjs';

const tester = createRuleTester();
const built = (kind) => [{ messageId: 'sqlBuilt', data: { kind } }];
const template = built('a template literal');
const concatenation = built('concatenation');

tester.run('no-sql-string-building', noSqlStringBuilding, {
  valid: [
    'export const find = (id) => pool.query("SELECT * FROM users WHERE id = $1", [id]);',
    'export const find = (id) => pool.query("SELECT * FROM users WHERE id = ?", [id]);',
    'export const find = (id) => db.execute(`SELECT * FROM users WHERE id = :id`, { id });',
    'export const find = (id) => sql`SELECT * FROM users WHERE id = ${id}`;',
    'export const find = (id) => prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}`;',
    'const TABLE = "users"; export const find = (id) => pool.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);',
    'const COLUMNS = "id, name"; export const all = () => pool.query("SELECT " + COLUMNS + " FROM users");',
    'const BASE = "SELECT * FROM users"; export const all = () => pool.query(BASE + " ORDER BY name");',
    'export const page = (n) => pool.query(`SELECT * FROM users LIMIT ${Number(n)}`);',
    'export const page = (n) => pool.query(`SELECT * FROM users LIMIT ${Math.min(n, 100)}`);',
    'export const page = (items) => pool.query(`SELECT * FROM users LIMIT ${items.length}`);',
    'export const many = (ids) => pool.query(`SELECT * FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ids);',
    'export const many = (ids) => { const marks = ids.map((_, i) => `$${i + 1}`).join(", "); return pool.query(`SELECT * FROM users WHERE id IN (${marks})`, ids); };',
    'export const find = (name) => pool.query(`SELECT * FROM users WHERE name = ${mysql.escape(name)}`);',
    'export const message = (name) => `Select the item from ${name}`;',
    'export const label = (name) => "Update " + name + " settings";',
    'export const greeting = (name) => `Hello ${name}, welcome to the app`;',
    'export const log = (id) => logger.info(`query for user ${id} finished`);',
    'export const path = (id) => "/users/" + id + "/orders";',
    'export const find = (id) => cache.get(`user:${id}`);',
    'import format from "pg-format"; export const find = (t, id) => pool.query(format("SELECT * FROM %I WHERE id = %L", t, id));',
    'export const total = (a, b) => a + b;',
    'export const query = (client, text) => client.query(text);',
    'export const q = "SELECT * FROM users WHERE active = 1";',
    'export const q = `SELECT *\n FROM users\n WHERE active = 1`;',
  ],
  invalid: [
    {
      code: 'export const find = (id) => pool.query("SELECT * FROM users WHERE id = " + id);',
      errors: concatenation,
    },
    {
      code: 'export const find = (id) => pool.query(`SELECT * FROM users WHERE id = ${id}`);',
      errors: template,
    },
    {
      code: 'export const find = (name) => pool.query("SELECT * FROM users WHERE name = \'" + name + "\'");',
      errors: concatenation,
    },
    {
      code: 'export const find = (id) => { const sql = `SELECT * FROM users WHERE id = ${id}`; return pool.query(sql); };',
      errors: template,
    },
    {
      code: 'export const find = (id) => { let sql = "SELECT * FROM users WHERE id = " + id; return db.execute(sql); };',
      errors: concatenation,
    },
    {
      code: 'export const find = (id) => pool.query({ text: `SELECT * FROM users WHERE id = ${id}`, values: [] });',
      errors: template,
    },
    {
      code: 'export const find = (id) => knex.raw(`select * from users where id = ${id}`);',
      errors: template,
    },
    {
      code: 'export const find = (id) => prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${id}`);',
      errors: template,
    },
    {
      code: 'export const find = (id) => sequelize.query("SELECT * FROM users WHERE id = " + id, { type: "SELECT" });',
      errors: concatenation,
    },
    {
      code: 'export const find = (id) => connection.execute("DELETE FROM users WHERE id = " + id);',
      errors: concatenation,
    },
    {
      code: "export const add = (name) => db.run(`INSERT INTO users (name) VALUES ('${name}')`);",
      errors: template,
    },
    {
      code: "export const rename = (id, name) => db.exec(`UPDATE users SET name = '${name}' WHERE id = ${id}`);",
      errors: template,
    },
    {
      code: 'const { query } = pool; export const find = (id) => query(`select * from users where id = ${id}`);',
      errors: template,
    },
    {
      code: 'const run = pool.query.bind(pool); export const find = (id) => run(`select * from users where id = ${id}`);',
      errors: template,
    },
    {
      code: 'const run = pool.query; export const find = (id) => run(`select * from users where id = ${id}`);',
      errors: template,
    },
    {
      code: 'export const find = (id) => runQuery(`select * from users where id = ${id}`);',
      errors: template,
    },
    {
      code: 'export const byId = (id) => `SELECT * FROM users WHERE id = ${id}`;',
      errors: template,
    },
    {
      code: 'export const byId = (id) => "SELECT * FROM users WHERE id = " + id;',
      errors: concatenation,
    },
    {
      code: 'export const where = (name) => "WHERE name = \'" + name + "\'";',
      errors: concatenation,
    },
    {
      code: 'export const order = (column) => `SELECT * FROM users ORDER BY ${column}`;',
      errors: template,
    },
    {
      code: 'export const find = (table) => pool.query(`SELECT * FROM ${table} WHERE active = 1`);',
      errors: template,
    },
    {
      code: 'export const find = (id) => pool.query("SELECT * FROM users WHERE id = ".concat(id));',
      errors: built('a string method'),
    },
    {
      code: 'export const find = (id) => pool.query(["SELECT * FROM users WHERE id =", id].join(" "));',
      errors: built('a string method'),
    },
    {
      code: 'import { format } from "node:util"; export const find = (id) => pool.query(format("SELECT * FROM users WHERE id = %s", id));',
      errors: built('a string method'),
    },
    {
      code: 'export const find = (id) => pool.query("SELECT * FROM users WHERE id = $1".replace("$1", id));',
      errors: built('a string method'),
    },
    {
      code: 'export const find = (name, age) => { let sql = "SELECT * FROM users WHERE 1 = 1"; sql += " AND name = \'" + name + "\'"; return pool.query(sql); };',
      errors: [{ messageId: 'sqlBuilt', data: { kind: 'concatenation' } }],
    },
    {
      code: 'export const find = (name) => { let sql = "SELECT * FROM users WHERE 1 = 1"; if (name) { sql += ` AND name = \'${name}\'`; } return pool.query(sql); };',
      errors: concatenation,
    },
    {
      code: "export const find = (filters) => { const clause = `AND name = '${filters.name}'`; return pool.query(`SELECT * FROM users WHERE active = 1 ${clause}`); };",
      errors: [template, template].flat(),
    },
  ],
});
