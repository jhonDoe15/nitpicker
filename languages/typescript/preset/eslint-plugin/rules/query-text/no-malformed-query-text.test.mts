import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-malformed-query-text.mts';

const ruleTester = typescriptRuleTester();

function failing(codes: readonly string[]) {
  return codes.map((code) => ({ code, errors: [{ messageId: 'malformed' as const }] }));
}

ruleTester.run('no-malformed-query-text', rule, {
  valid: cases([
    "const sql = 'SELECT * FROM t WHERE a = ?';",
    "let where = ' WHERE 1 = 1'; if (group) { where += ' AND group_id LIKE ?'; params.push(group); }",
    "let where = ''; where += ' AND group_id LIKE '; where += '?';",
    "let where = ''; where += ' AND group_id LIKE '; if (x) { where += '?'; }",
    "const q = 'SELECT * FROM t WHERE a = ' + id;",
    `const q = \`SELECT * FROM t WHERE a = \${id}\`;`,
    "const q = 'SELECT * FROM t ' + 'WHERE a = ?';",
    "const q = 'SELECT * FROM t' + ' WHERE a = ?';",
    "const q = 'INSERT INTO t (a, b) VALUES (?, ?)';",
    "const q = 'INSERT INTO t (a, b) VALUES (?, now())';",
    "const label = 'total =';",
    "const label = 'user_' + 'name';",
    "const q = 'SELECT a >= 1 AS big FROM t';",
    "run('SELECT * FROM t WHERE a = ' + 'b');",
    "const msg = 'Select a value ='",
    "qb.append(' AND a = ').append(value);",
    "function f() { return ' AND a = '; }",
  ]),
  invalid: failing([
    "function f() { let where = ''; if (group) { where += ' AND group_id LIKE '; params.push(group); } return where; }",
    "const q = 'SELECT * FROM t WHERE a = AND b = ?';",
    "function f() { return 'SELECT * FROM t WHERE a = '; }",
    "run('SELECT * FROM t WHERE a IN ');",
    "const q = 'INSERT INTO lock_table (a, b, c, d) VALUES (?, ?, ?)';",
    "const q = 'INSERT INTO lock_table (a, b, c, d) ' + 'values (?, ?, ?)';",
    "const q = 'SELECT * FROM t' + 'WHERE a = ?';",
    "const q = 'SELECT * FROM t WHERE' + 'a = ?';",
    'const s = "if redis.call(\'get\', k) == v then" + "redis.call(\'del\', k) end";',
    'function f() { return `SELECT * FROM t WHERE a = `; }',
  ]),
});
