import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { batchForm, GENERIC_FORM } from './batch-forms.mts';
import { rule as ioInLoop } from '../no-io-in-loop.mts';

const ruleTester = typescriptRuleTester();

const PRISMA_FORM = batchForm('prisma.user.findUnique()', undefined);
const KNEX_FORM = batchForm('knex().where()', undefined);

function inLoop(statement: string, loopHead = 'const id of ids') {
  return `for (${loopHead}) { ${statement} }`;
}

function reported(messageId: string, data?: Record<string, string>) {
  return (code: string) => ({ code, errors: [{ messageId, ...(data ? { data } : {}) }] });
}

ruleTester.run('no-io-in-loop advice', ioInLoop, {
  valid: [],
  invalid: [
    {
      code: inLoop('await userRepository.findById(id);'),
      errors: [
        { messageId: 'query', data: { callee: '`userRepository.findById()`', form: GENERIC_FORM } },
      ],
    },
    {
      code: inLoop('await prisma.user.findUnique({ where: { id } });'),
      errors: [
        { messageId: 'query', data: { callee: '`prisma.user.findUnique()`', form: PRISMA_FORM } },
      ],
    },
    {
      code: `import knex from 'knex'; ${inLoop("await knex('users').where({ id });")}`,
      errors: [{ messageId: 'query', data: { callee: '`knex().where()`', form: KNEX_FORM } }],
    },
    ...[
      inLoop('await repo.findOne({ where: { id: post.authorId } });', 'const post of posts'),
      inLoop(
        'await prisma.user.findUnique({ where: { id: comment.user_id } });',
        'const comment of comments',
      ),
      inLoop(
        'const owner = await this.ownerRepository.findOneBy({ id: row.ownerId });',
        'const row of rows',
      ),
      inLoop(
        'await db.select().from(users).where(eq(users.id, post.authorId));',
        'const post of posts',
      ),
      'await Promise.all(posts.map((post) => repository.findOne({ where: { id: post.authorId } })));',
    ].map(reported('foreignKeyQuery')),
    ...[
      inLoop('await repo.findOne({ where: { id: post.id } });', 'const post of posts'),
      inLoop('await repo.update(post.authorId, { seen: true });', 'const post of posts'),
      inLoop('await repo.findOne({ where: { slug: post.slug } });', 'const post of posts'),
      inLoop('await repo.findOne({ where: { id: ids[post.index] } });', 'const post of posts'),
    ].map(reported('query')),
    ...[
      'let parent = start; for (let depth = 0; depth < 5; depth++) { parent = await repo.findById(parent.parentId); }',
      'let latest = first; for (const id of ids) { latest = await repo.findOne({ where: { previousId: latest.id } }); }',
      'let page = first; for (let i = 0; i < 3; i++) { page = await client.get(page.next); }',
    ].map(reported('dependentQuery')),
    ...[
      'let latest = first; for (const id of ids) { const row = await repo.findOne({ where: { previousId: latest.id } }); latest = other; }',
    ].map(reported('query')),
  ],
});
