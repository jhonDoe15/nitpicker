import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-unatomic-writes.mjs';

const ALL = ['typeorm', 'prisma', 'drizzle', 'kysely', 'knex', 'sequelize', 'mikro'];
const forms = (orms, opensTransactions = true) => [{ orms, opensTransactions }];

function valid(code, orms = ALL, opensTransactions = true) {
  return { code, options: forms(orms, opensTransactions) };
}

function invalid(code, messageId, orms = ALL, opensTransactions = true) {
  return { code, options: forms(orms, opensTransactions), errors: [{ messageId }] };
}

typescriptRuleTester().run('no-unatomic-writes escapes', rule, {
  valid: [
    valid(
      'class S { async run(o) { await this.dataSource.transaction(async (manager) => { await manager.save(Order, o); await manager.getRepository(Item).save(o.items); }); } }',
    ),
    valid(
      'class S { async run(o) { await this.prisma.$transaction(async (tx) => { await tx.order.create({ data: o }); await tx.item.createMany({ data: o.items }); }); } }',
    ),
    valid(
      'class S { async run(o) { await this.prisma.$transaction(async (tx) => { const items = tx.item; await items.create({ data: o }); }); } }',
    ),
    valid(
      'async function run(db, o) { await db.transaction(async (tx) => { await tx.insert(orders).values(o); await tx.update(items).set(o); }); }',
    ),
    valid(
      'async function run(db, o) { await db.transaction().execute(async (trx) => { await trx.insertInto("orders").values(o).execute(); await trx.updateTable("items").set(o).execute(); }); }',
    ),
    valid(
      'async function run(knex, o) { await knex.transaction(async (trx) => { await trx("orders").insert(o); await trx("items").insert(o); }); }',
    ),
    valid(
      'async function run(sequelize, o) { await sequelize.transaction(async (t) => { await Order.create(o, { transaction: t }); await Item.update(o, { where: {}, transaction: t }); }); }',
    ),
    valid(
      'async function run(sequelize, o) { await sequelize.transaction(async (t) => { await Order.create(o, opts(t)); }); }',
    ),
    valid(
      'class S { async run(o) { await this.em.transactional(async (em) => { await this.orderRepository.nativeInsert(o); }); } }',
      ['mikro'],
    ),
    valid(
      'class S { async run(o) { await this.dataSource.transaction(async (manager) => { await this.service.save(o, manager); this.orderRepository.create(o); await this.orderRepository.find(); }); } }',
    ),
    valid(
      'class S { async run(o, manager) { await this.dataSource.transaction(async (tx) => { await manager.save(o); }); } }',
    ),
    valid(
      'class S { async run(o) { await this.orderRepository.manager.transaction(async (manager) => { await this.orderRepository.save(o, { transaction: manager }); }); } }',
    ),
    valid(
      'class S { async run(o) { await this.dataSource.transaction(async () => { await this.orderRepository.save(o); }); } }',
    ),
    valid(
      'class S { async run(o) { await this.prisma.$transaction(async (tx) => { await this.prisma.order.create({ data: o }); }); } }',
      [],
    ),
  ],
  invalid: [
    invalid(
      'class S { async run(o) { await this.dataSource.transaction(async (manager) => { await manager.save(Order, o); await this.roleRepository.save(o.role); }); } }',
      'escaped',
    ),
    invalid(
      'class S { async run(o) { await this.prisma.$transaction(async (tx) => { await tx.order.create({ data: o }); await this.prisma.item.create({ data: o }); }); } }',
      'escaped',
    ),
    invalid(
      'async function run(o) { await db.transaction(async (tx) => { await tx.insert(orders).values(o); await db.update(items).set(o); }); }',
      'escaped',
    ),
    invalid(
      'async function run(o) { await db.transaction().execute(async (trx) => { await db.insertInto("items").values(o).execute(); }); }',
      'escaped',
    ),
    invalid(
      'async function run(o) { await knex.transaction(async (trx) => { await knex("items").insert(o); }); }',
      'escaped',
    ),
    invalid(
      'async function run(sequelize, o) { await sequelize.transaction(async (t) => { await Order.create(o); }); }',
      'escaped',
    ),
    invalid(
      'async function run(sequelize, o) { await sequelize.transaction(async (t) => { await Item.destroy({ where: {} }); }); }',
      'escaped',
    ),
    invalid(
      'class S { async run(o) { await this.dataSource.transaction(async (manager) => { const repo = this.orderRepository; await repo.save(o); }); } }',
      'escaped',
      ['typeorm'],
      false,
    ),
  ],
});

typescriptRuleTester().run('no-unatomic-writes separate writes', rule, {
  valid: [
    valid(
      'class S { async run(o) { await this.orderRepository.save(o); await this.orderRepository.update(o.id, o); } }',
    ),
    valid(
      'class S { async run(o) { await this.orderRepository.save(o); await this.itemRepository.save(o); } }',
      ALL,
      false,
    ),
    valid(
      'class S { async run(o) { await this.orderRepository.save(o); await this.itemRepository.find(); } }',
    ),
    valid(
      'class S { async run(o) { if (o.a) { await this.orderRepository.save(o); } else { await this.itemRepository.save(o); } } }',
    ),
    valid(
      'class S { async run(o, manager) { await manager.save(Order, o); await manager.save(Item, o); } }',
    ),
    valid(
      'class S { async run(o) { await this.orderRepository.save(o); await this.itemRepository.save(o, { transaction: tx }); } }',
    ),
    valid(
      'class S { async run(o) { await this.dataSource.transaction(async (m) => { await m.save(Order, o); await m.save(Item, o); }); } }',
    ),
    valid(
      'class S { @Transactional() async run(o) { await this.orderRepository.save(o); await this.itemRepository.save(o); } }',
    ),
    valid(
      'class S { async run(o) { try { await this.orderRepository.save(o); } catch (e) { await this.errorRepository.save(e); } } }',
    ),
    valid(
      'async function run(db, o) { await db.insert(orders).values(o); await db.insert(orders).values(o); }',
    ),
    valid(
      'class S { async run(o) { await this.cache.set("k", o); await this.orderRepository.save(o); } }',
    ),
    valid('class S { run(o) { this.orderRepository.save(o); this.itemRepository.save(o); } }'),
    valid(
      'class S { async run(o) { if (o.a) { await this.orderRepository.save(o); return; } await this.itemRepository.save(o); } }',
    ),
    valid(
      'class S { async run(o) { await this.txHost.withTransaction(async () => { await this.orderRepository.save(o); await this.itemRepository.save(o); }); } }',
    ),
    valid(
      'class S { async run(o) { const em = this.orm.em.fork(); await em.begin(); await em.persistAndFlush(o); await em.nativeInsert(Item, o); await em.commit(); } }',
    ),
    valid(
      'class S { async run(o) { await this.em.transactional(async (em) => { await this.orderRepository.nativeInsert(o); }); } }',
      ['typeorm', 'mikro'],
    ),
  ],
  invalid: [
    invalid(
      'class S { async run(o) { await this.orderRepository.save(o); await this.itemRepository.save(o.items); } }',
      'separate',
    ),
    invalid(
      'class S { async run(o) { await this.prisma.order.create({ data: o }); await this.prisma.item.deleteMany({}); } }',
      'separate',
    ),
    invalid(
      'async function run(o) { await db.insert(orders).values(o); await db.delete(items).where(eq(items.id, o.id)); }',
      'separate',
    ),
    invalid(
      'async function run(o) { await db.insertInto("orders").values(o).execute(); await db.deleteFrom("items").execute(); }',
      'separate',
    ),
    invalid(
      'async function run(o) { await knex("orders").insert(o); await knex("items").where({ id: 1 }).del(); }',
      'separate',
    ),
    invalid(
      'async function run(o) { await Order.create(o); await Item.destroy({ where: {} }); }',
      'separate',
    ),
    invalid(
      'class S { async run(o) { await this.em.nativeInsert(Order, o); await this.em.nativeDelete(Item, {}); } }',
      'separate',
    ),
    invalid(
      'class S { async run(o) { await this.repo.manager.save(Order, o); await this.repo.manager.save(Item, o.items); } }',
      'separate',
    ),
    invalid(
      'class S { async run(o) { await this.orderRepository.createQueryBuilder().insert().into(Order).values(o).execute(); await this.itemRepository.save(o); } }',
      'separate',
    ),
    invalid(
      'class S { async run(o) { await Promise.all([this.orderRepository.save(o), this.itemRepository.save(o)]); } }',
      'separate',
    ),
    invalid(
      'class S { async run(o) { await this.dataSource.transaction(async (m) => { await m.save(Order, o); }); await this.orderRepository.save(o); await this.itemRepository.save(o); } }',
      'separate',
    ),
  ],
});
