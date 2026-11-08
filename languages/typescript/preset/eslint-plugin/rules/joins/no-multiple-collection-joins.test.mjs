import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-multiple-collection-joins.mjs';
import { ormProject } from './test-support/orm-stubs.mjs';

const root = ormProject();
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

const TYPEORM = [
  "import { EntityManager, Repository } from 'typeorm';",
  "import { Customer, Item, Order } from './entities';",
  'declare const orders: Repository<Order>;',
  'declare const items: Repository<Item>;',
  'declare const manager: EntityManager;',
].join('\n');
const MIKRO = [
  "import { EntityManager, EntityRepository, LoadStrategy } from '@mikro-orm/core';",
  "import { Author } from './entities';",
  'declare const em: EntityManager;',
  'declare const authors: EntityRepository<Author>;',
].join('\n');
const SEQUELIZE = "import { Invoice, Line } from './entities';";

let counter = 0;

function typed(header, body, errors) {
  counter += 1;
  const code = `${header}\nexport async function run() {\n${body}\n}\n`;
  const filename = path.join(root, `src/case-${String(counter)}.ts`);
  writeFileSync(filename, code);
  return { filename, code, ...(errors === undefined ? {} : { errors }) };
}

function crossed(messageId, first, second) {
  return [{ messageId, data: { first, second } }];
}

tester.run('no-multiple-collection-joins', rule, {
  valid: [
    typed(TYPEORM, "return orders.find({ relations: ['items', 'customer'] });"),
    typed(TYPEORM, "return orders.find({ relations: ['items', 'items.options'] });"),
    typed(
      TYPEORM,
      'return orders.find({ relations: { items: { options: true }, customer: true } });',
    ),
    typed(
      TYPEORM,
      "return orders.find({ relations: ['items', 'payments'], relationLoadStrategy: 'query' });",
    ),
    typed(TYPEORM, 'return orders.find({ relations: { items: true, payments: false } });'),
    typed(TYPEORM, "return orders.find({ relations: ['items', 'missing', 'missing.payments'] });"),
    typed(
      TYPEORM,
      "return Promise.all([orders.find({ relations: ['items'] }), orders.find({ relations: ['payments'] })]);",
    ),
    typed(
      TYPEORM,
      "const local = { find: (o: object) => o }; return local.find({ relations: ['items', 'payments'] });",
    ),
    typed(
      TYPEORM,
      "return orders.createQueryBuilder('o').leftJoinAndSelect('o.items', 'i').leftJoinAndSelect('o.customer', 'c').leftJoinAndSelect('i.options', 'op').getMany();",
    ),
    typed(
      TYPEORM,
      "return orders.createQueryBuilder('o').leftJoinAndSelect(Item, 'i', 'i.orderId = o.id').leftJoinAndSelect('o.items', 'x').getMany();",
    ),
    typed(MIKRO, "return em.find(Author, {}, { populate: ['books', 'prizes'] });"),
    typed(
      MIKRO,
      "return em.find(Author, {}, { populate: ['books', 'prizes'], strategy: 'select-in' });",
    ),
    typed(
      MIKRO,
      "return em.find(Author, {}, { populate: ['books', 'mentor'], strategy: LoadStrategy.JOINED });",
    ),
    typed(
      SEQUELIZE,
      "return Invoice.findAll({ include: [{ model: Line, as: 'lines' }, { association: 'buyer' }] });",
    ),
    typed(
      SEQUELIZE,
      "return Invoice.findAll({ include: [{ association: 'lines', separate: true }, 'refunds'] });",
    ),
    typed(SEQUELIZE, 'return Invoice.findAll({ include: [Line] });'),
    typed(SEQUELIZE, 'return Invoice.findAll({ include: [{ all: true }] });'),
  ],
  invalid: [
    typed(
      TYPEORM,
      "return orders.find({ relations: ['items', 'payments'] });",
      crossed('typeorm', 'items', 'payments'),
    ),
    typed(
      TYPEORM,
      'return orders.findOne({ relations: { items: true, payments: true } });',
      crossed('typeorm', 'items', 'payments'),
    ),
    typed(
      TYPEORM,
      "const relations = ['items', 'customer.addresses'];\nreturn orders.findAndCount({ where: {}, relations });",
      crossed('typeorm', 'items', 'customer.addresses'),
    ),
    typed(
      TYPEORM,
      "return items.find({ relations: ['options.tags', 'options.notes'] });",
      crossed('typeorm', 'options.tags', 'options.notes'),
    ),
    typed(
      TYPEORM,
      'return items.find({ relations: { options: { tags: true }, labels: true } });',
      crossed('typeorm', 'options', 'labels'),
    ),
    typed(
      TYPEORM,
      "return manager.find(Order, { relations: ['items', 'payments'] });",
      crossed('typeorm', 'items', 'payments'),
    ),
    typed(
      TYPEORM,
      "return orders.createQueryBuilder('o').leftJoinAndSelect('o.items', 'i').innerJoinAndSelect('o.payments', 'p').getMany();",
      crossed('typeorm', 'items', 'payments'),
    ),
    typed(
      TYPEORM,
      "return manager.createQueryBuilder(Item, 'i').leftJoinAndSelect('i.options', 'op').leftJoinAndSelect('op.tags', 't').leftJoinAndSelect('op.notes', 'n').getMany();",
      crossed('typeorm', 'options.tags', 'options.notes'),
    ),
    typed(
      TYPEORM,
      "return manager.createQueryBuilder().select('o').from(Order, 'o').leftJoinAndSelect('o.items', 'i').leftJoinAndSelect('o.payments', 'p').getMany();",
      crossed('typeorm', 'items', 'payments'),
    ),
    typed(
      TYPEORM,
      "const query = orders.createQueryBuilder('o').leftJoinAndSelect('o.items', 'i');\nquery.leftJoinAndSelect('o.payments', 'p');\nreturn query.getMany();",
      crossed('typeorm', 'items', 'payments'),
    ),
    typed(
      MIKRO,
      "return em.find(Author, {}, { populate: ['books', 'prizes'], strategy: 'joined' });",
      crossed('mikroOrm', 'books', 'prizes'),
    ),
    typed(
      MIKRO,
      "return authors.findAll({ populate: ['books', 'prizes'], strategy: LoadStrategy.JOINED });",
      crossed('mikroOrm', 'books', 'prizes'),
    ),
    typed(
      SEQUELIZE,
      "return Invoice.findAll({ include: [{ model: Line, as: 'lines' }, { association: 'refunds' }] });",
      crossed('sequelize', 'lines', 'refunds'),
    ),
    typed(
      SEQUELIZE,
      "return Invoice.findByPk(1, { include: ['lines', { association: 'refunds', required: false }] });",
      crossed('sequelize', 'lines', 'refunds'),
    ),
    typed(
      SEQUELIZE,
      "return Invoice.findAndCountAll({ include: [{ association: 'lines', separate: false }, 'refunds'] });",
      crossed('sequelize', 'lines', 'refunds'),
    ),
  ],
});
