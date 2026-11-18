import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule as ioInLoop } from '../no-io-in-loop.mts';
import { inLoop, onceFor } from './loop-cases.mts';

const ruleTester = typescriptRuleTester();

ruleTester.run('no-io-in-loop unexecuted builders', ioInLoop, {
  valid: cases([
    inLoop("parts.push(knex.raw('?? = ?', [column, id]));"),
    inLoop("query.select(db.raw('? as ??', [expression, id]));"),
    inLoop("const fragment = knex.raw('?? (?)', [id, length]); fragments.push(fragment);"),
    "const fragments = columns.map((column) => knex.raw('?? (?)', [column, length]));",
    `const fragments = ids.map((id) => this.knex.raw(\`MIN(\${id})\`));`,
    inLoop("update.set({ amount: knex.raw('?::numeric', [id]) });"),
    inLoop("const rows = { total: this.knex.raw('count(*)') }; use(rows);"),
    inLoop("const qb = repo.createQueryBuilder('a'); builders.push(qb);"),
    inLoop(
      "const qb = repo.createQueryBuilder('a'); sub.push(qb.where('a.id = :id', { id }).getQuery());",
    ),
    inLoop("apply(repo.createQueryBuilder('a'), id);"),
    inLoop("const qb = this.repository.createQueryBuilder('a'); qb.where({ id }); use(qb);"),
    inLoop('query = query.union(db.select().from(users).where(eq(users.id, id)));'),
    inLoop('const sub = db.select().from(users).where(eq(users.id, id)); subs.push(sub.toSQL());'),
    inLoop('const sub = db.select().from(users).where(eq(users.id, id)); use(sub);'),
    inLoop('statements.set(id, db.select().from(users).where(eq(users.id, id)));'),
    inLoop(
      'const condition = { rows: db.select().from(users).where(eq(users.id, id)) }; use(condition);',
    ),
    inLoop('const builder = knex("users").where({ id }).update({ seen: true }); use(builder);'),
  ]),
  invalid: [
    onceFor(inLoop("await knex.raw('select 1 where id = ?', [id]);")),
    onceFor(
      inLoop("const { rowCount } = await knex.raw('update t set a = 1 where id = ?', [id]);"),
    ),
    onceFor(inLoop("await this.knex.raw('select 1').then((result) => use(result));")),
    onceFor(
      "async function run() { for (const id of ids) { return knex.raw('select ?', [id]); } }",
    ),
    onceFor(inLoop("await repo.createQueryBuilder('a').where('a.id = :id', { id }).getMany();")),
    onceFor(
      inLoop(
        "await repo.createQueryBuilder().delete().from(A).where('id = :id', { id }).execute();",
      ),
    ),
    onceFor(inLoop("const rows = await this.repo.createQueryBuilder('a').where({ id }).getOne();")),
    onceFor(
      inLoop(
        "const qb = repo.createQueryBuilder('a'); qb.where({ id }); const rows = await qb.getMany();",
      ),
    ),
    onceFor(
      inLoop(
        "const qb = repo.createQueryBuilder('a'); const rows = await qb.where({ id }).getOne(); use(rows);",
      ),
    ),
    onceFor(inLoop('const rows = await db.select().from(users).where(eq(users.id, id));')),
    onceFor(
      inLoop(
        'const query = db.select().from(users).where(eq(users.id, id)); const rows = await query;',
      ),
    ),
    onceFor(
      inLoop(
        'const query = db.select().from(users).where(eq(users.id, id)); await query.execute();',
      ),
    ),
    onceFor(
      inLoop(
        "const q = repo.createQueryBuilder('a').where({ id }); this.cache = q; await this.cache.getMany();",
      ),
    ),
    onceFor(inLoop("this.builder = repo.createQueryBuilder('a').where({ id });")),
    onceFor(inLoop("const qb = repo.createQueryBuilder('a'); holder.query = qb;")),
    onceFor(inLoop('await knex("users").where({ id }).update({ seen: true });')),
    onceFor(inLoop('db.select().from(users).where(eq(users.id, id)).then(use);')),
    onceFor("await Promise.all(ids.map((id) => knex.raw('select ?', [id])));", 'concurrentQuery'),
    onceFor("ids.map(async (id) => knex.raw('select ?', [id]));"),
    onceFor(
      'await Promise.all(ids.map((id) => db.select().from(users).where(eq(users.id, id))));',
      'concurrentQuery',
    ),
  ],
});
