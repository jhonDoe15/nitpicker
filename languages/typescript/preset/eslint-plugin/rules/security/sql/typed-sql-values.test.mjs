import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule, taggedForm } from './no-sql-string-building.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-sql-typed-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2022'],
      allowJs: true,
      checkJs: true,
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });
const header = 'declare const pool: { query(text: string): unknown };\n';
let counter = 0;

function typed(body, errors, extension = 'ts') {
  counter += 1;
  const code = extension === 'ts' ? `${header}${body}` : body;
  const file = path.join(root, `src/case-${String(counter)}.${extension}`);
  writeFileSync(file, code);
  return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
}

const built = [
  { messageId: 'sqlBuilt', data: { kind: 'a template literal', tagged: taggedForm() } },
];

tester.run('no-sql-string-building with types', rule, {
  valid: [
    typed(
      'export const page = (limit: number) => pool.query(`SELECT * FROM users LIMIT ${limit}`);',
    ),
    typed(
      "export const sorted = (direction: 'asc' | 'desc') => pool.query(`SELECT * FROM users ORDER BY name ${direction}`);",
    ),
    typed(
      'export const flagged = (active: boolean) => pool.query(`SELECT * FROM users WHERE active = ${active}`);',
    ),
    typed(
      "type Column = 'name' | 'created_at'; export const sorted = (column: Column) => pool.query(`SELECT * FROM users ORDER BY ${column}`);",
    ),
    typed(
      'export const many = (ids: number[]) => pool.query(`SELECT * FROM users WHERE id IN (${ids.join(",")})`);',
    ),
    typed(
      'const COLUMNS = { name: "name", email: "email" } as const; export function update(id: string, fields: Partial<Record<keyof typeof COLUMNS, string>>) { const keys = Object.keys(fields) as (keyof typeof COLUMNS)[]; const set = keys.map((k, i) => `${COLUMNS[k]} = $${i + 1}`).join(", "); return pool.query(`UPDATE users SET ${set} WHERE id = $${keys.length + 1}`); }',
    ),
    typed(
      'export const many = (ids: string[]) => pool.query(`SELECT * FROM users WHERE id IN (${"?,".repeat(ids.length).slice(0, -1)})`);',
    ),
    typed(
      'type Table = "users" | "orders"; export abstract class Repository { protected constructor(private readonly table: Table) {} findById() { return pool.query(`SELECT * FROM ${this.table} WHERE id = $1`); } }',
    ),
    typed(
      'const TABLES = ["users", "orders"]; export async function up() { for (const table of TABLES) { await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`); } }',
    ),
    typed(
      'const TABLES = ["users", "orders"];\nexport async function up(pool) { for (const table of TABLES) { await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`); } }',
      undefined,
      'js',
    ),
    typed(
      'export function page(pool, params, size) { return pool.query(`SELECT * FROM users WHERE org = $1 LIMIT $${params.length + 1}`, [...params, size]); }',
      undefined,
      'js',
    ),
    typed(
      'const COLUMNS = { name: "name", created: "created_at" };\nexport const f = (pool, key) => pool.query(`SELECT * FROM users ORDER BY ${COLUMNS[key]}`);',
      undefined,
      'js',
    ),
  ],
  invalid: [
    typed(
      'export const page = (limit: string) => pool.query(`SELECT * FROM users LIMIT ${limit}`);',
      built,
    ),
    typed(
      'export const sorted = (column: string) => pool.query(`SELECT * FROM users ORDER BY ${column}`);',
      built,
    ),
    typed(
      "export const sorted = (direction: 'asc' | string) => pool.query(`SELECT * FROM users ORDER BY name ${direction}`);",
      built,
    ),
    typed(
      "export const sorted = (direction: 'asc; drop table users') => pool.query(`SELECT * FROM users ORDER BY name ${direction}`);",
      built,
    ),
    typed(
      'export abstract class Repository { protected constructor(private readonly table: string) {} findById() { return pool.query(`SELECT * FROM ${this.table} WHERE id = $1`); } }',
      built,
    ),
    typed(
      'export const many = (ids: string[]) => pool.query(`SELECT * FROM users WHERE id IN (${ids.join(",")})`);',
      built,
    ),
  ],
});
