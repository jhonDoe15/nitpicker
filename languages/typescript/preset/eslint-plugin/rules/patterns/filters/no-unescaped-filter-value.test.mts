import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unescaped-filter-value.mts';

const tester = typescriptRuleTester();

function flagged(code: string, value: string, operator: string) {
  return { code, errors: [{ messageId: 'unescapedValue', data: { value, operator } }] };
}

tester.run('no-unescaped-filter-value', rule, {
  valid: [
    'export const a = (p: string, n: string) => prisma.dataset.findMany({ where: { projectId: p, name: { startsWith: escapeSqlLikePattern(n) + " (copy" } } });',
    'export const a = (n: string) => prisma.dataset.findMany({ where: { name: { contains: "draft" } } });',
    'export const a = (n: string) => prisma.dataset.findMany({ where: { name: { contains: escapeLike(n) } } });',
    'export const a = (n: string) => prisma.dataset.findMany({ where: { name: { contains: n.replace(/[\\\\%_]/g, "\\\\$&") } } });',
    'export const a = (n: string) => prisma.dataset.findMany({ where: { name: { equals: n } } });',
    'export const a = (n: string) => prisma.dataset.findMany({ where: { name: n } });',
    'export const a = (n: string) => prisma.dataset.findMany({ where: { name: { equals: "x", mode: "insensitive" } } });',
    'export const a = (n: string) => prisma.dataset.findMany({ where: { name: { in: [n], mode: "insensitive" } } });',
    'export const a = (n: string) => matcher.find({ where: { name: { contains: n } } });',
    'export const a = (n: string) => expect(x).toEqual({ name: { contains: n } });',
    'export const a = (n: string) => { const escapedName = escape(n); return prisma.user.findMany({ where: { name: { contains: escapedName } } }); };',
    `export const a = (n: string) => { const pattern = \`%\${escapeLike(n)}%\`; return db.where("name", "like", pattern); };`,
    'export const a = (n: string) => db.where("name", "=", n);',
    'export const a = (n: string) => db.where("name", "like", "a%");',
    `export const a = (n: string) => sql\`select * from t where name = \${n}\`;`,
    `export const a = (n: string) => sql\`select * from t where name like \${"a%"}\`;`,
    `export const a = (n: string) => sql\`select * from t where id = \${n} and name like \${escapeLike(n)}\`;`,
    `export const a = (n: string) => other\`select * from t where name like \${n}\`;`,
    `export const a = (n: string) => ({ $like: \`%\${escapeLike(n)}%\` });`,
    'export const a = (n: string) => ({ $regex: new RegExp(escapeRegExp(n)) });',
    'export const a = (n: string) => ({ $regex: /^a/ });',
    `export const a = (n: string) => Like(\`%\${escapeLike(n)}%\`);`,
    'export const a = (n: string) => like(table.name, "a%");',
    'export const a = (n: string) => ({ [Op.eq]: n });',
    'export const a = (n: number) => ({ $like: 5 });',
    'export const q = { startsWith: "x" };',
    'export const f = (s: string) => ({ contains: s });',
    'export const g = (s: string) => ({ startsWith: s, endsWith: s });',
    'export const h = (i: string) => { const where = { email: { contains: i } }; return where; };',
  ],
  invalid: [
    flagged(
      'export const a = (n: string, p: string) => prisma.dataset.findMany({ where: { projectId: p, name: { startsWith: n + " (copy" } } });',
      'n',
      'startsWith',
    ),
    flagged(
      'export const a = (n: string) => prisma.dataset.findFirst({ where: { name: { contains: n } } });',
      'n',
      'contains',
    ),
    flagged(
      'export const a = (n: string) => prisma.user.count({ where: { OR: [{ email: { endsWith: n.trim() } }] } });',
      'n',
      'endsWith',
    ),
    flagged(
      'export const a = (n: string) => prisma.user.findMany({ where: { name: { equals: n, mode: "insensitive" } } });',
      'n',
      'equals',
    ),
    flagged(
      'export const a = (i: { q: string }) => prisma.user.deleteMany({ where: { email: { contains: i.q } } });',
      'i.q',
      'contains',
    ),
    flagged(
      `export const a = (n: string) => { const term = \`\${n}%\`; return prisma.user.findMany({ where: { email: { startsWith: term } } }); };`,
      'n',
      'startsWith',
    ),
    flagged(
      `export const a = (n: string) => sql\`select * from t where name like \${\`%\${n}%\`}\`;`,
      'n',
      'LIKE',
    ),
    flagged(
      `export const a = (n: string) => Prisma.sql\`select * from t where name ILIKE \${n}\`;`,
      'n',
      'LIKE',
    ),
    flagged(
      `export const a = (n: string) => prisma.$queryRaw\`select 1 where name not like \${n}\`;`,
      'n',
      'LIKE',
    ),
    flagged(
      `export const a = (n: string) => db.whereILike("name", \`%\${n}%\`);`,
      'n',
      'whereILike',
    ),
    flagged(`export const a = (n: string) => db.where("name", "like", \`%\${n}\`);`, 'n', 'LIKE'),
    flagged(`export const a = (n: string) => like(table.name, \`%\${n}%\`);`, 'n', 'like'),
    flagged('export const a = (n: string) => ilike(table.name, n);', 'n', 'ilike'),
    flagged(`export const a = (n: string) => Like(\`%\${n}%\`);`, 'n', 'Like'),
    flagged('export const a = (n: string) => ({ name: ILike(n) });', 'n', 'ILike'),
    flagged(
      `export const a = (search: string) => ({ $like: \`%\${search}%\` });`,
      'search',
      '$like',
    ),
    flagged(`export const a = (n: string) => ({ [Op.iLike]: \`%\${n}%\` });`, 'n', 'Op.iLike'),
    flagged('export const a = (n: string) => ({ $regex: n });', 'n', '$regex'),
  ],
});
