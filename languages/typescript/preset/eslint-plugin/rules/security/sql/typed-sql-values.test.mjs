import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './no-sql-string-building.mjs';

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

function typed(body, errors) {
  counter += 1;
  const code = `${header}${body}`;
  const file = path.join(root, `src/case-${String(counter)}.ts`);
  writeFileSync(file, code);
  return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
}

const built = [{ messageId: 'sqlBuilt', data: { kind: 'a template literal' } }];

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
  ],
});
