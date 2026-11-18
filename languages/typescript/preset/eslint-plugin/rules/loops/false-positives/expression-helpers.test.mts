import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule as ioInLoop } from '../no-io-in-loop.mts';

const ruleTester = typescriptRuleTester();

const DRIZZLE = "import { eq, and, or, isNull, isNotNull, inArray, sql } from 'drizzle-orm';\n";
const PRISMA = "import { Prisma } from '@prisma/client';\n";

function inLoop(statement: string, header = DRIZZLE) {
  return `${header}for (const id of ids) { ${statement} }`;
}

ruleTester.run('no-io-in-loop expression helpers', ioInLoop, {
  valid: cases([
    inLoop('conditions.push(eq(table.id, id));'),
    inLoop('conditions.push(and(eq(table.id, id), isNull(table.deletedAt)));'),
    inLoop('conditions.push(or(isNotNull(table.a), inArray(table.b, [id])));'),
    inLoop('conditions.push(sql`${table.id} = ${id}`);'),
    inLoop('conditions.push(sql.raw("false"));'),
    inLoop('conditions.push(sql.raw(`${prefix}_locales`));'),
    inLoop('parts.push(sql.join([sql.identifier(id)], sql`, `));'),
    inLoop('const where = (row) => eq(row.id, id);'),
    inLoop('const fragments = rows.map((row) => eq(row.id, id));'),
    inLoop('const make = () => { return and(eq(table.id, id)); };'),
    "import { eq as equals, sql } from 'drizzle-orm/sql'; for (const id of ids) { list.push(sql`x`); }",
    inLoop('parts.push(Prisma.sql`id = ${id}`);', PRISMA),
    inLoop('parts.push(Prisma.raw(`${prefix}${id}`));', PRISMA),
    inLoop('parts.push(Prisma.join(values, ", "));', PRISMA),
    inLoop('parts.push(Prisma.empty);', PRISMA),
    inLoop(
      'const fragment = Prisma.sql`ARRAY[${Prisma.join(values.map((v) => Prisma.sql`${v}`))}]`;',
      PRISMA,
    ),
    inLoop('return Prisma.sql`id = ${id}`;', PRISMA),
  ]),
  invalid: [
    ...[
      inLoop('await db.select().from(users).where(eq(users.id, id));'),
      inLoop('await db.execute(sql`select 1 where id = ${id}`);'),
      inLoop('await db.execute(sql.raw(`select ${id}`));'),
      inLoop('await db.delete(users).where(and(eq(users.id, id), isNull(users.deletedAt)));'),
      inLoop('await prisma.$queryRaw(Prisma.sql`select 1 where id = ${id}`);', PRISMA),
      inLoop('await prisma.$executeRaw(Prisma.sql`delete from t where id = ${id}`);', PRISMA),
      inLoop('await prisma.user.findUnique({ where: { id } });', PRISMA),
      inLoop('await prisma.$queryRawUnsafe(`select ${id}`);', PRISMA),
    ].map((code) => ({ code, errors: [{ messageId: 'query' }] })),
  ],
});
