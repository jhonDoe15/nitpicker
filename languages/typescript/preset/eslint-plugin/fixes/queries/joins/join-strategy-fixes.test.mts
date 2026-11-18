import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../../../rules/joins/no-multiple-collection-joins.mts';
import { ormProject } from '../../../rules/joins/test-support/orm-stubs.mts';

const MANIFEST = JSON.stringify({ dependencies: { '@mikro-orm/core': '^6.0.0' } });
const ASSOCIATIONS = [
  "import { Invoice, Line } from './entities';",
  "Invoice.hasMany(Line, { as: 'lines' });",
  "Invoice.hasMany(Line, { as: 'refunds' });",
].join('\n');
const CRATE = [
  "import { OneToMany } from 'typeorm';",
  "import { Item, Tag } from './entities';",
  'export class Crate {',
  '  items!: Item[];',
  '  payments!: Tag[];',
  '  @OneToMany(() => Tag, (tag: Tag) => tag, { eager: true }) tags!: Tag[];',
  '}',
].join('\n');
const OLD_TYPEORM = [
  'export interface FindOneOptions<T> { where?: unknown; relations?: unknown; take?: number }',
  'export declare class Repository<T> {',
  '  find(options?: FindOneOptions<T>): Promise<T[]>;',
  '  findOne(options: FindOneOptions<T>): Promise<T | null>;',
  '}',
  'export declare function OneToMany(...args: unknown[]): PropertyDecorator;',
].join('\n');

const roots = {
  current: ormProject({
    'package.json': MANIFEST,
    'src/associations.ts': ASSOCIATIONS,
    'src/crate.ts': CRATE,
  }),
  bare: ormProject({ 'package.json': MANIFEST }),
  hooked: ormProject({
    'package.json': MANIFEST,
    'src/associations.ts': ASSOCIATIONS,
    'src/hooks.ts':
      "import { Line } from './entities';\n(Line as any).addHook('beforeFind', () => undefined);",
  }),
  old: ormProject({ 'package.json': MANIFEST, 'node_modules/typeorm/index.d.ts': OLD_TYPEORM }),
};
afterAll(() => {
  for (const root of Object.values(roots)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const TYPEORM = [
  "import { EntityManager, Repository } from 'typeorm';",
  "import { Item, Order } from './entities';",
  "import { Crate } from './crate';",
  'declare const orders: Repository<Order>;',
  'declare const items: Repository<Item>;',
  'declare const crates: Repository<Crate>;',
  'declare const manager: EntityManager;',
  'declare const base: object;',
  'declare const filter: object;',
].join('\n');
const MIKRO = [
  "import { EntityManager, EntityRepository } from '@mikro-orm/core';",
  "import { Author } from './entities';",
  'declare const em: EntityManager;',
  'declare const authors: EntityRepository<Author>;',
  'declare const filter: object;',
  'declare const base: object;',
].join('\n');
const SEQUELIZE = [
  "import { Invoice, Line } from './entities';",
  'declare const base: object;',
].join('\n');

type Project = keyof typeof roots;
type Spec = {
  readonly project: Project;
  readonly header: string;
  readonly orm: string;
  readonly suggestion: string;
  readonly pair: readonly [string, string];
};

const TYPEORM_SPEC = {
  project: 'current',
  header: TYPEORM,
  orm: 'typeorm',
  suggestion: 'queryStrategy',
  pair: ['items', 'payments'],
} as const satisfies Spec;
const MIKRO_SPEC = {
  project: 'current',
  header: MIKRO,
  orm: 'mikroOrm',
  suggestion: 'selectIn',
  pair: ['books', 'prizes'],
} as const satisfies Spec;
const SEQUELIZE_SPEC = {
  project: 'current',
  header: SEQUELIZE,
  orm: 'sequelize',
  suggestion: 'separate',
  pair: ['lines', 'refunds'],
} as const satisfies Spec;

const wrapped = (spec: Spec, body: string) =>
  `${spec.header}\nexport async function run() {\n${body}\n}\n`;

function typed(spec: Spec, body: string) {
  const filename = path.join(roots[spec.project], `src/case-${randomUUID()}.ts`);
  const code = wrapped(spec, body);
  writeFileSync(filename, code);
  return { filename, code };
}

function reported(spec: Spec, body: string, output: string | undefined) {
  const [first, second] = spec.pair;
  const suggestions =
    output === undefined
      ? {}
      : { suggestions: [{ messageId: spec.suggestion, output: wrapped(spec, output) }] };
  return {
    ...typed(spec, body),
    errors: [{ messageId: spec.orm, data: { first, second }, ...suggestions }],
  };
}

const typeorm = (body: string, output?: string, spec: Spec = TYPEORM_SPEC) =>
  reported(spec, body, output);
const mikro = (body: string, output?: string, spec: Spec = MIKRO_SPEC) =>
  reported(spec, body, output);
const sequelize = (body: string, output?: string, spec: Spec = SEQUELIZE_SPEC) =>
  reported(spec, body, output);
const QUERY = "relationLoadStrategy: 'query'";

function run(project: Project, name: string, invalid: ReturnType<typeof reported>[]) {
  typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: roots[project] }).run(
    name,
    rule,
    { valid: [], invalid },
  );
}

run('current', 'no-multiple-collection-joins TypeORM suggestion', [
  typeorm(
    "return orders.findOne({ relations: ['items', 'payments'] });",
    `return orders.findOne({ relations: ['items', 'payments'], ${QUERY} });`,
  ),
  typeorm(
    'return orders.findOne({ where: { id: 1 }, relations: { items: true, payments: true } });',
    `return orders.findOne({ where: { id: 1 }, relations: { items: true, payments: true }, ${QUERY} });`,
  ),
  typeorm(
    "return orders.find({ relations: ['items', 'payments'], take: 50 });",
    `return orders.find({ relations: ['items', 'payments'], take: 50, ${QUERY} });`,
  ),
  typeorm(
    "return orders.findAndCount({ relations: ['items', 'payments'], take: 50, skip: 10 });",
    `return orders.findAndCount({ relations: ['items', 'payments'], take: 50, skip: 10, ${QUERY} });`,
  ),
  typeorm(
    "return orders.find({ where: { id: 1 }, order: { id: 'ASC' }, relations: ['items', 'payments'], take: 5 });",
    `return orders.find({ where: { id: 1 }, order: { id: 'ASC' }, relations: ['items', 'payments'], take: 5, ${QUERY} });`,
  ),
  typeorm(
    "return orders.find({ where: [{ id: 1 }, { id: 2 }], relations: ['items', 'payments'], take: 5 });",
    `return orders.find({ where: [{ id: 1 }, { id: 2 }], relations: ['items', 'payments'], take: 5, ${QUERY} });`,
  ),
  typeorm(
    "return manager.find(Order, { relations: ['items', 'payments'], take: 5 });",
    `return manager.find(Order, { relations: ['items', 'payments'], take: 5, ${QUERY} });`,
  ),
  typeorm(
    "return items.findOne({ relations: ['options.tags', 'options.notes'] });",
    `return items.findOne({ relations: ['options.tags', 'options.notes'], ${QUERY} });`,
    { ...TYPEORM_SPEC, pair: ['options.tags', 'options.notes'] },
  ),
  typeorm(
    "const relations = ['items', 'payments'];\nreturn orders.findOne({ relations });",
    `const relations = ['items', 'payments'];\nreturn orders.findOne({ relations, ${QUERY} });`,
  ),
  typeorm(
    "return orders.findOne({ withDeleted: true, relations: ['items', 'payments'] });",
    `return orders.findOne({ withDeleted: true, relations: ['items', 'payments'], ${QUERY} });`,
  ),
]);

run('current', 'no-multiple-collection-joins TypeORM declined', [
  typeorm("return orders.find({ relations: ['items', 'payments'] });"),
  typeorm("return orders.findAndCount({ relations: ['items', 'payments'] });"),
  typeorm(
    "return orders.findOne({ where: { items: { id: 1 } }, relations: ['items', 'payments'] });",
  ),
  typeorm(
    "return orders.findOne({ where: [{ id: 1 }, { payments: { id: 1 } }], relations: ['items', 'payments'] });",
  ),
  typeorm("return orders.findOne({ where: filter, relations: ['items', 'payments'] });"),
  typeorm(
    "return orders.findOne({ order: { items: { id: 'ASC' } }, relations: ['items', 'payments'] });",
  ),
  typeorm("return orders.findOne({ select: { id: true }, relations: ['items', 'payments'] });"),
  typeorm(
    "return orders.findOne({ lock: { mode: 'pessimistic_read' }, relations: ['items', 'payments'] });",
  ),
  typeorm("return orders.findOne({ loadRelationIds: true, relations: ['items', 'payments'] });"),
  typeorm(
    "return orders.findOne({ relationLoadStrategy: 'join', relations: ['items', 'payments'] });",
  ),
  typeorm("return orders.findOne({ ...base, relations: ['items', 'payments'] });"),
  typeorm("const options = { relations: ['items', 'payments'] };\nreturn orders.findOne(options);"),
  typeorm("return crates.findOne({ relations: ['items', 'payments'] });", undefined, TYPEORM_SPEC),
]);

run('current', 'no-multiple-collection-joins MikroORM suggestion', [
  mikro(
    "return em.find(Author, {}, { populate: ['books', 'prizes'] });",
    "return em.find(Author, {}, { populate: ['books', 'prizes'], strategy: 'select-in' });",
  ),
  mikro(
    "return em.findOne(Author, { id: 1 }, { populate: ['books', 'prizes'], fields: ['name'] });",
    "return em.findOne(Author, { id: 1 }, { populate: ['books', 'prizes'], fields: ['name'], strategy: 'select-in' });",
  ),
  mikro(
    "return authors.findAll({ populate: ['books', 'prizes'] });",
    "return authors.findAll({ populate: ['books', 'prizes'], strategy: 'select-in' });",
  ),
  mikro(
    "return authors.find({ id: 1 }, { populate: ['books', 'prizes'], offset: 2 });",
    "return authors.find({ id: 1 }, { populate: ['books', 'prizes'], offset: 2, strategy: 'select-in' });",
  ),
]);

run('current', 'no-multiple-collection-joins MikroORM declined', [
  mikro("return em.find(Author, {}, { populate: ['books', 'prizes'], strategy: 'joined' });"),
  mikro("return em.find(Author, { books: { id: 1 } }, { populate: ['books', 'prizes'] });"),
  mikro("return em.find(Author, filter, { populate: ['books', 'prizes'] });"),
  mikro(
    "return em.find(Author, {}, { populate: ['books', 'prizes'], orderBy: { books: { id: 'asc' } } });",
  ),
  mikro(
    "return em.find(Author, {}, { populate: ['books', 'prizes'], populateWhere: { books: {} } });",
  ),
  mikro("return em.find(Author, {}, { ...base, populate: ['books', 'prizes'] });"),
  mikro(
    "const options = { populate: ['books', 'prizes'] as string[] };\nreturn em.find(Author, {}, options);",
  ),
  mikro("return em.find(Author, { $or: [{ books: {} }] }, { populate: ['books', 'prizes'] });"),
]);

run('current', 'no-multiple-collection-joins Sequelize suggestion', [
  sequelize(
    "return Invoice.findAll({ include: [{ model: Line, as: 'lines' }, { association: 'refunds' }] });",
    "return Invoice.findAll({ include: [{ model: Line, as: 'lines' }, { association: 'refunds', separate: true }] });",
  ),
  sequelize(
    "return Invoice.findAll({ include: ['lines', 'refunds'] });",
    "return Invoice.findAll({ include: ['lines', { association: 'refunds', separate: true }] });",
  ),
  sequelize(
    "return Invoice.findAll({ include: ['buyer', 'lines', 'refunds'], limit: 5, where: { id: 1 } });",
    "return Invoice.findAll({ include: ['buyer', 'lines', { association: 'refunds', separate: true }], limit: 5, where: { id: 1 } });",
  ),
  sequelize(
    "return Invoice.findByPk(1, { include: ['lines', { association: 'refunds' }] });",
    "return Invoice.findByPk(1, { include: ['lines', { association: 'refunds', separate: true }] });",
  ),
  sequelize(
    "return Invoice.findAndCountAll({ include: ['lines', 'refunds'], distinct: true });",
    "return Invoice.findAndCountAll({ include: ['lines', { association: 'refunds', separate: true }], distinct: true });",
  ),
  sequelize(
    "return Invoice.findAll({ include: ['lines', 'refunds'], order: [['id', 'DESC']] });",
    "return Invoice.findAll({ include: ['lines', { association: 'refunds', separate: true }], order: [['id', 'DESC']] });",
  ),
]);

run('current', 'no-multiple-collection-joins Sequelize declined', [
  sequelize(
    "return Invoice.findAll({ include: ['lines', { association: 'refunds', where: { id: 1 } }] });",
  ),
  sequelize(
    "return Invoice.findAll({ include: ['lines', { association: 'refunds', required: false }] });",
  ),
  sequelize(
    "return Invoice.findAll({ include: ['lines', { association: 'refunds', attributes: ['id'] }] });",
  ),
  sequelize(
    "return Invoice.findAll({ include: ['lines', { association: 'refunds', separate: false }] });",
  ),
  sequelize(
    "return Invoice.findAll({ include: ['lines', { association: 'refunds', include: ['x'] }] });",
  ),
  sequelize("return Invoice.findAndCountAll({ include: ['lines', 'refunds'] });"),
  sequelize("return Invoice.findAll({ include: ['lines', 'refunds'], raw: true });"),
  sequelize("return Invoice.findAll({ include: ['lines', 'refunds'], attributes: ['id'] });"),
  sequelize(
    "return Invoice.findAll({ include: ['lines', 'refunds'], order: [['lines.position', 'ASC']] });",
  ),
  sequelize(
    "return Invoice.findAll({ include: ['lines', 'refunds'], order: [[{ model: Line, as: 'lines' }, 'id', 'ASC']] });",
  ),
  sequelize(
    "return Invoice.findAll({ include: ['lines', 'refunds'], where: { '$lines.id$': 1 } });",
  ),
  sequelize("return Invoice.findAll({ include: ['lines', 'refunds'], ...base });"),
  sequelize("const include = ['lines', 'refunds'];\nreturn Invoice.findAll({ include });"),
]);

run('bare', 'no-multiple-collection-joins Sequelize without a hasMany proof', [
  sequelize("return Invoice.findAll({ include: ['lines', 'refunds'] });", undefined, {
    ...SEQUELIZE_SPEC,
    project: 'bare',
  }),
]);

run('hooked', 'no-multiple-collection-joins Sequelize with find hooks', [
  sequelize("return Invoice.findAll({ include: ['lines', 'refunds'] });", undefined, {
    ...SEQUELIZE_SPEC,
    project: 'hooked',
  }),
]);

run('old', 'no-multiple-collection-joins TypeORM without relationLoadStrategy', [
  typeorm("return orders.findOne({ relations: ['items', 'payments'] });", undefined, {
    ...TYPEORM_SPEC,
    project: 'old',
  }),
]);
