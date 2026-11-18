import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule as ioInLoop } from '../no-io-in-loop.mts';

const ruleTester = typescriptRuleTester();

function inLoop(statement: string, loopHead = 'const workspace of workspaces') {
  return `for (${loopHead}) { ${statement} }`;
}

function reported(messageId: string) {
  return (code: string) => ({ code, errors: [{ messageId }] });
}

ruleTester.run('no-io-in-loop set queries', ioInLoop, {
  valid: cases([
    'for (const part of chunk(ids, 100)) { await repo.find({ where: { id: In(part) } }); }',
    'for (const part of batches) { await prisma.user.findMany({ where: { id: { in: part } } }); }',
    'for (let i = 0; i < ids.length; i += 100) { await repo.find({ where: { id: In(ids.slice(i, i + 100)) } }); }',
    'const rows = await repo.find({ where: { id: In(ids) } });',
  ]),
  invalid: [
    ...[
      inLoop('await repo.find({ where: { channelId: In(channelIds) } });'),
      inLoop('const rows = await this.messageRepository.find({ where: { id: In(orphanIds) } });'),
      inLoop('await this.repository.findBy({ id: In(await loadIds(workspace)) });'),
      inLoop('await prisma.user.findMany({ where: { id: { in: allIds } } });'),
      inLoop('await repository.find({ where: { _id: { $in: allIds } } });'),
      inLoop('await repo.find({ where: { id: In(group) } });', 'const group of groups'),
      inLoop('await db.select().from(users).where(inArray(users.id, allIds));'),
      inLoop('await repository.find({ where: { parentId: In(workspace.childIds) } });'),
      inLoop('await prisma.post.deleteMany({ where: { authorId: { in: workspace.memberIds } } });'),
      "import knex from 'knex'; for (const workspace of workspaces) { await knex('users').whereIn('id', allIds); }",
      inLoop('await repository.delete({ id: In(staleIds) });'),
      'await Promise.all(workspaces.map((workspace) => repository.find({ where: { id: In(allIds) } })));',
      'workspaces.forEach(async (workspace) => { await repository.find({ where: { id: In(allIds) } }); });',
    ].map((code) => ({ code, errors: [{ messageId: 'setQuery' }] })),
    ...[
      inLoop('await repo.find({ where: { id: In([id]) } });', 'const id of ids'),
      inLoop('await prisma.user.findMany({ where: { id: { in: [id] } } });', 'const id of ids'),
      inLoop('await repo.find({ where: { id: In([row.id]) } });', 'const row of rows'),
      inLoop('await repository.find({ where: { id: { $in: [id] } } });', 'const id of ids'),
      inLoop('await repo.findOne({ where: { id } });', 'const id of ids'),
      inLoop(
        'await prisma.user.findMany({ where: { orgId: id, role: { in: roles } } });',
        'const id of ids',
      ),
      inLoop('await repo.find({ where: { owner: id, status: In(roles) } });', 'const id of ids'),
      inLoop(
        'await prisma.user.findMany({ where: { id: { in: [id, other] } } });',
        'const id of ids',
      ),
      inLoop('await repo.find({ where: { channelId: workspace.id } });'),
    ].map(reported('query')),
  ],
});
