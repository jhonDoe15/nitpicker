import { describe, expect, it } from 'vitest';
import { mayReadTables } from './read-candidates.mts';

const READS = [
  "const rows = await db.selectFrom('asset').selectAll().execute();",
  "const rows = await knex('users').where({ deletedAt: null });",
  "const rows = await trx.from('users').select('*');",
  "const rows = await query.table(\n  'users').first();",
  "const rows = await builder['from']('users');",
  "const rows = await builder.from?.('users');",
  "const rows = await builder.from<User>('users');",
  "const rows = await builder.from(/* table */ 'users');",
  "const rows = await builder.from(('users'));",
  'const rows = await db.select().from(users).where(isNull(users.deletedAt));',
  'const row = await db.query.users.findFirst({ where: eq(users.id, id) });',
  'const rows = await prisma.user.findMany({ where: { deletedAt: null } });',
  'const rows = await this.userRepository.find({ where: { deletedAt: IsNull() } });',
  'const rows = await this.#repo.find({});',
  'const rows = await em.find(User, {});',
  'const rows = await em\n  .find(User, {});',
  "const rows = await this.manager?.['find'](User, {});",
  'const rows = await getRepository(User).find({});',
  "const rows = await dataSource.createQueryBuilder(User, 'u').getMany();",
  'const rows = await User.findAll({ where: { deletedAt: null } });',
  'const rows = await userModel.count({});',
  'const rows = await (User as typeof Model).findOne({});',
  "const rows = await builder.fr\\u006fm('users');",
  "const rows = await db['sel\\ectFrom']('users');",
  'const rows = await userRepository\n// note\n.find({});',
  'const rows = await userRepository.\n// note\nfind({});',
  'const rows = await User\n// note\n.findAll({});',
  "const rows = await db.from\u200B('users');",
  'const rows = await userRepository.\u200Bfind({});',
  "const rows = await db.table\u0085('users');",
];

const NO_READS = [
  "import { from } from 'rxjs';\nimport x from './x';\nexport * from './y';",
  "import a from 'a';\nconst items = Array.from(list);\nconst found = items.find((item) => item.id === id);",
  'const found = items.find((item) => item.id === id);\nconst total = list.count(1);',
  "import { connect } from 'react-redux';\nconst label = t('copied from the clipboard');",
];

describe('mayReadTables', () => {
  it.each(READS)('keeps a file that may read a table: %s', (text) => {
    expect(mayReadTables(text)).toBe(true);
  });

  it.each(NO_READS)('skips a file that cannot read a table: %s', (text) => {
    expect(mayReadTables(text)).toBe(false);
  });
});
