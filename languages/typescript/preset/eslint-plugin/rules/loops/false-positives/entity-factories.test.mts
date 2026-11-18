import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule as ioInLoop } from '../no-io-in-loop.mts';

const ruleTester = typescriptRuleTester();

function inLoop(statement: string) {
  return `for (const id of ids) { ${statement} }`;
}

function onceFor(code: string, messageId = 'query') {
  return { code, errors: [{ messageId }] };
}

ruleTester.run('no-io-in-loop repository create', ioInLoop, {
  valid: cases([
    'const entities = projects.map((project) => this.sharedCredentialsRepository.create({ projectId: project.id }));',
    `const entities = []; ${inLoop('entities.push(repo.create({ id }));')} await repo.save(entities);`,
    `const entities = []; ${inLoop('entities.push(this.projectRepository.create({ id }));')} return entities;`,
    `const entities = []; ${inLoop('const entity = repository.create({ id }); entities.push(entity);')} await repository.insert(entities);`,
    inLoop('const entity = repo.create({ id }); entity.name = id; return entity;'),
    inLoop('const entity = repo.create({ id }); return entity;'),
    'const make = () => { for (const id of ids) { const role = roleRepo.create({ slug: id }); return role; } };',
    'const rows = ids.map((id) => { return userRepository.create({ id }); });',
    'const items = []; ids.forEach((id) => { items.push(this.repo.create({ id })); }); await this.repo.save(items);',
    'const rows = ids.map((id) => repo.create({ id })); await repo.save(rows);',
  ]),
  invalid: [
    onceFor(inLoop('await repository.save(repository.create({ id }));')),
    onceFor(inLoop('const entity = repo.create({ id }); await repo.save(entity);')),
    onceFor(inLoop('await this.albumUserRepository.create({ userId: id });')),
    onceFor(inLoop('const created = await this.userRepository.create({ id });')),
    onceFor(inLoop('this.userRepository.create({ id }).then(use);')),
    onceFor(
      'await Promise.all(memories.map((memory) => this.memoryRepository.create(memory)));',
      'concurrentQuery',
    ),
    onceFor('await Promise.all(ids.map(async (id) => repo.create({ id })));', 'concurrentQuery'),
    onceFor('ids.map(async (id) => this.userRepository.create({ id }));'),
    onceFor(inLoop('await prisma.user.create({ data: { id } });')),
    onceFor(inLoop('const rows = await this.dao.create({ id });')),
    onceFor(
      `const ops = []; ${inLoop('ops.push(prisma.repository.create({ data: { id } }));')} await Promise.all(ops);`,
      'concurrentQuery',
    ),
    onceFor(
      `const ps = []; ${inLoop('const p = prisma.repo.create({ data: { id } }); ps.push(p);')} await Promise.all(ps);`,
    ),
    onceFor(inLoop('entities.push(repo.create({ id }));')),
    onceFor(inLoop('use(repo.create({ id }));')),
    onceFor(inLoop('const entity = repo.create({ id }); use(entity);')),
    onceFor(inLoop('const entity = repo.create({ id }); await entity;')),
    onceFor(inLoop('const entity = prisma.repository.create({ data }); entity.then(use);')),
    onceFor(inLoop('this.pending = repo.create({ id });')),
    onceFor(inLoop('const entity = repo.create({ id }); this.pending = entity;')),
    onceFor(inLoop('const entity = repo.create({ id }); await entity.save();')),
    onceFor(
      'await prisma.$transaction(ids.map((id) => prisma.repository.create({ data: { id } })));',
    ),
    onceFor(
      'const ops = []; ids.forEach((id) => ops.push(prisma.repository.create({ data: { id } }))); return Promise.all(ops);',
      'concurrentQuery',
    ),
  ],
});
