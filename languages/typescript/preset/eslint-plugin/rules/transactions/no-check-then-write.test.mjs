import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-check-then-write.mjs';

const ALL = ['typeorm', 'prisma', 'drizzle', 'kysely', 'knex', 'sequelize'];

function valid(code, orms = ALL, opensTransactions = true) {
  return { code, options: [{ orms, opensTransactions }] };
}

function invalid(code) {
  return {
    code,
    options: [{ orms: ALL, opensTransactions: true }],
    errors: [{ messageId: 'race' }],
  };
}

typescriptRuleTester().run('no-check-then-write', rule, {
  valid: [
    valid(
      'class S { async add(o) { const n = await this.projectRepository.count(); if (n >= 3) throw new Error("limit"); await this.projectRepository.insert(o); } }',
      ALL,
      false,
    ),
    valid(
      'class S { async add(o) { const n = await this.projectRepository.count({ lock: { mode: "pessimistic_write" } }); if (n >= 3) throw new Error("limit"); await this.projectRepository.insert(o); } }',
    ),
    valid(
      'class S { async add(o) { await this.dataSource.transaction(async (m) => { const n = await m.count(Project); if (n >= 3) throw new Error("limit"); await m.insert(Project, o); }); } }',
    ),
    valid(
      'class S { async add(o) { const row = await this.projectRepository.findOne({ where: { id: o.id } }); if (!row) { await this.projectRepository.upsert(o, ["id"]); } } }',
    ),
    valid(
      'class S { async add(o) { const row = await this.projectRepository.findOne({ where: { id: o.id } }); if (row) { await this.projectRepository.update({ id: o.id, version: row.version }, o); } } }',
    ),
    valid(
      'class S { async add(o) { const row = await this.projectRepository.findOne({ where: { id: o.id } }); if (row) { await this.itemRepository.save(o); } } }',
    ),
    valid(
      'class S { async add(o) { const row = await this.projectRepository.findOne({ where: { id: o.id } }); await this.projectRepository.save(o); } }',
    ),
    valid(
      'class S { async add(o) { const n = await this.prisma.project.count(); if (n >= 3) { return; } await this.prisma.$transaction(async (tx) => { await tx.project.create({ data: o }); }); } }',
    ),
    valid(
      'async function add(o) { const row = await Project.findOne({ where: { id: o.id } }); if (row) { await Project.update({ name: o.name }, { where: { id: o.id } }); } }',
    ),
    valid(
      'class S { async rename(id, dto) { const user = await this.userRepository.findOne({ where: { id } }); if (!user) throw new NotFoundException(); user.name = dto.name; return this.userRepository.save(user); } }',
    ),
    valid(
      'class S { async rename(id, dto) { const user = await this.userRepository.findOneBy({ id }); if (!user) throw new NotFoundException(); await this.userRepository.update(id, dto); } }',
    ),
    valid(
      'class S { async rename(id, dto) { const user = await this.prisma.user.findUnique({ where: { id } }); if (!user) throw new NotFoundException(); return this.prisma.user.update({ where: { id }, data: dto }); } }',
    ),
    valid(
      'class S { async remove(id, me) { const post = await this.postRepository.findOneBy({ id }); if (post.ownerId !== me) throw new ForbiddenException(); await this.postRepository.delete(id); } }',
    ),
    valid(
      'class S { async close(id) { const order = await this.orderRepository.findOneByOrFail({ id }); if (order.status !== "open") throw new Error("closed"); order.status = "closed"; await this.orderRepository.save(order); } }',
    ),
  ],
  invalid: [
    invalid(
      'class S { async add(o) { const n = await this.projectRepository.count(); if (n >= 3) throw new Error("limit"); await this.projectRepository.insert(o); } }',
    ),
    invalid(
      'class S { async add(o) { const row = await this.prisma.project.findFirst({ where: { name: o.name } }); if (!row) { await this.prisma.project.create({ data: o }); } } }',
    ),
    invalid(
      'async function add(o) { if ((await knex("projects").count()) > 3) { return; } await knex("projects").insert(o); }',
    ),
    invalid(
      'async function add(o) { const row = await db.selectFrom("projects").selectAll().executeTakeFirst(); if (!row) { await db.insertInto("projects").values(o).execute(); } }',
    ),
    invalid(
      'class S { async register(dto) { const existing = await this.userRepository.findOneBy({ email: dto.email }); if (existing) throw new ConflictException(); return this.userRepository.save(this.userRepository.create(dto)); } }',
    ),
  ],
});
