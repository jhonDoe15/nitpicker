export const GENERIC_FORM =
  'a batch method (`findByIds`, `findAllById`, `createMany`, `insertMany`) or `WHERE id IN (...)`';

const FORMS = new Map([
  [
    'typeorm',
    'a set condition such as `findBy({ id: In(ids) })`, or `insert(rows)` for several rows',
  ],
  [
    '@prisma/client',
    '`findMany({ where: { id: { in: ids } } })`, or `createMany` and `updateMany` for writes',
  ],
  ['knex', '`whereIn(column, ids)`, or `insert(rows)` with an array of rows'],
  ['drizzle-orm', '`inArray(column, ids)` in the `where`, or `insert(table).values(rows)`'],
  ['mongoose', '`find({ _id: { $in: ids } })`, or `insertMany(docs)`'],
]);

function untypedPackage(label: string): string | undefined {
  const root = /^[A-Za-z_$][\w$]*/u.exec(label)?.[0].toLowerCase();
  if (root === 'prisma') {
    return '@prisma/client';
  }
  return root === 'knex' ? 'knex' : undefined;
}

export function batchForm(label: string, pkg: string | undefined): string {
  const known = pkg === undefined ? untypedPackage(label) : pkg;
  const name = known?.startsWith('drizzle-orm') === true ? 'drizzle-orm' : known;
  return (name === undefined ? undefined : FORMS.get(name)) ?? GENERIC_FORM;
}
