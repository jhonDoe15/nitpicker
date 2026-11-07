import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule as noEagerRelation } from './no-eager-relation.mjs';
import { rule as noManyToManyCascadeRemove } from './no-many-to-many-cascade-remove.mjs';

const tester = typescriptRuleTester();
const typeorm =
  "import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';\n";
const mikro =
  "import { Cascade, Entity, EntitySchema, ManyToMany, ManyToOne, defineEntity } from '@mikro-orm/core';\n";
const sequelize = "import { DataTypes, Model } from 'sequelize';\n";
const scoped = "import { DefaultScope, Table } from 'sequelize-typescript';\n";

function flagged(code, messageId, count = 1) {
  return { code, errors: Array.from({ length: count }, () => ({ messageId })) };
}

tester.run('no-eager-relation', noEagerRelation, {
  valid: [
    `${typeorm}@Entity() class Order { @ManyToOne(() => Customer) customer: Customer; }`,
    `${typeorm}@Entity() class Order { @ManyToOne(() => Customer, { eager: false }) customer: Customer; }`,
    `${typeorm}@Entity() class Order { @ManyToOne(() => Customer, { lazy: true }) customer: Promise<Customer>; }`,
    `${typeorm}repository.find({ relations: { customer: true } });`,
    `${mikro}@Entity() class Order { @ManyToOne(() => Customer) customer!: Customer; }`,
    `${mikro}const Order = defineEntity({ name: 'Order', properties: (p) => ({ customer: p.manyToOne(() => Customer).ref() }) });`,
    `${mikro}const Order = defineEntity({ name: 'Order', properties: (p) => ({ customer: p.manyToOne(() => Customer).eager(false) }) });`,
    'function ManyToOne(options) { return options; }\nclass Order { @ManyToOne({ eager: true }) customer; }',
    'const builder = { manyToOne: () => builder, eager: () => builder };\nbuilder.manyToOne().eager();',
    `${sequelize}Order.init({}, { sequelize, scopes: { withCustomer: { include: [Customer] } } });`,
    `${sequelize}Order.init({}, { sequelize, defaultScope: { where: { active: true } } });`,
    `${sequelize}Order.init({}, { sequelize, defaultScope: { include: [] } });`,
    `${sequelize}Order.init({}, { sequelize, defaultScope: { include: undefined } });`,
    `${scoped}@DefaultScope(() => { const nested = () => ({ include: [A] }); return { where: {} }; })\n@Table class Order {}`,
    'const config = { defaultScope: { include: [Customer] } };',
    `${typeorm}new EntitySchema({ name: 'order', relations: { customer: { type: 'many-to-one', target: 'customer' } } });`,
  ],
  invalid: [
    flagged(
      `${typeorm}const eager = true;\nclass Order { @ManyToOne(() => Customer, { eager }) customer: Customer; }`,
      'typeormEager',
    ),
    flagged(
      `${typeorm}const shared = { eager: true };\nclass Order { @ManyToOne(() => A, shared) a: A; @ManyToOne(() => B, shared) b: B; }`,
      'typeormEager',
    ),
    flagged(
      `${typeorm}new EntitySchema({ name: 'order', relations: { customer: { type: \`many-to-one\`, target: 'customer', eager: true as const } } });`,
      'typeormEager',
    ),
    flagged(
      "import { Model } from '@sequelize/core';\nOrder.init({}, { sequelize, defaultScope: { include: [Customer] } });",
      'sequelizeDefaultScope',
    ),
    flagged(
      `${scoped}@DefaultScope(() => { if (archived) { return { include: [Archive] }; } return {}; })\n@Table class Order {}`,
      'sequelizeDefaultScope',
    ),
    flagged(
      `${typeorm}@Entity() class Order { @ManyToOne(() => Customer, { eager: true }) customer: Customer; }`,
      'typeormEager',
    ),
    flagged(
      `${typeorm}@Entity() class Order { @OneToOne(() => Profile, (p) => p.user, { eager: true }) profile: Profile; }`,
      'typeormEager',
    ),
    flagged(
      `${typeorm}@Entity() class Order { @OneToMany(() => Line, (l) => l.order, { eager: true }) lines: Line[]; }`,
      'typeormEager',
    ),
    flagged(
      `${typeorm}@Entity() class Post { @ManyToMany(() => Tag, { eager: true }) tags: Tag[]; }`,
      'typeormEager',
    ),
    flagged(
      "import * as orm from 'typeorm';\nclass Order { @orm.ManyToOne(() => Customer, { eager: true }) customer: Customer; }",
      'typeormEager',
    ),
    flagged(
      "import { ManyToOne as Parent } from 'typeorm';\nclass Order { @Parent(() => Customer, { eager: true }) customer: Customer; }",
      'typeormEager',
    ),
    flagged(
      `${typeorm}const always = { eager: true } as const;\nclass Order { @ManyToOne(() => Customer, always) customer: Customer; }`,
      'typeormEager',
    ),
    flagged(
      `${typeorm}const base = { eager: true };\nclass Order { @ManyToOne(() => Customer, { ...base, nullable: false }) customer: Customer; }`,
      'typeormEager',
    ),
    flagged(
      "const { ManyToOne } = require('typeorm');\nclass Order { @ManyToOne(() => Customer, { eager: true }) customer; }",
      'typeormEager',
    ),
    flagged(
      `${typeorm}new EntitySchema({ name: 'order', relations: { customer: { type: 'many-to-one', target: 'customer', eager: true } } });`,
      'typeormEager',
    ),
    flagged(
      `${mikro}@Entity() class Order { @ManyToOne({ entity: () => Customer, eager: true }) customer!: Customer; }`,
      'mikroOrmEager',
    ),
    flagged(
      "import { ManyToOne } from '@mikro-orm/decorators/legacy';\nclass Order { @ManyToOne(() => Customer, { eager: true }) customer!: Customer; }",
      'mikroOrmEager',
    ),
    flagged(
      `${mikro}new EntitySchema({ name: 'Order', properties: { customer: { kind: 'm:1', entity: () => Customer, eager: true } } });`,
      'mikroOrmEager',
    ),
    flagged(
      `${mikro}import { ReferenceKind } from '@mikro-orm/core';\nnew EntitySchema({ name: 'Order', properties: { customer: { kind: ReferenceKind.MANY_TO_ONE, entity: 'Customer', eager: true } } });`,
      'mikroOrmEager',
    ),
    flagged(
      `${mikro}const Order = defineEntity({ name: 'Order', properties: (p) => ({ customer: p.manyToOne(() => Customer).eager() }) });`,
      'mikroOrmEager',
    ),
    flagged(
      `${mikro}const Order = defineEntity({ name: 'Order', properties: (p) => ({ tags: p.manyToMany(() => Tag).owner().eager(true) }) });`,
      'mikroOrmEager',
    ),
    flagged(
      `${sequelize}Order.init({}, { sequelize, defaultScope: { include: [Customer] } });`,
      'sequelizeDefaultScope',
    ),
    flagged(
      `${sequelize}Order.init({}, { sequelize, defaultScope: { include: { model: Customer, as: 'customer' } } });`,
      'sequelizeDefaultScope',
    ),
    flagged(
      "const { Sequelize } = require('sequelize');\nsequelize.define('order', {}, { defaultScope: { include: [Customer] } });",
      'sequelizeDefaultScope',
    ),
    flagged(
      `${sequelize}Order.addScope('defaultScope', { include: [Customer] }, { override: true });`,
      'sequelizeDefaultScope',
    ),
    flagged(
      `${scoped}@DefaultScope(() => ({ include: [Customer] }))\n@Table class Order {}`,
      'sequelizeDefaultScope',
    ),
    flagged(
      `${scoped}@DefaultScope(() => { return { include: [Customer] }; })\n@Table class Order {}`,
      'sequelizeDefaultScope',
    ),
  ],
});

tester.run('no-many-to-many-cascade-remove', noManyToManyCascadeRemove, {
  valid: [
    `${typeorm}class Post { @ManyToMany(() => Tag, { cascade: ['insert', 'update'] }) tags: Tag[]; }`,
    `${typeorm}class Post { @ManyToMany(() => Tag) tags: Tag[]; }`,
    `${typeorm}class Post { @ManyToMany(() => Tag, { onDelete: 'CASCADE' }) tags: Tag[]; }`,
    `${typeorm}class Order { @OneToMany(() => Line, (l) => l.order, { cascade: true }) lines: Line[]; }`,
    `${typeorm}class Order { @ManyToOne(() => Customer, { cascade: ['remove'] }) customer: Customer; }`,
    `${mikro}class Post { @ManyToMany({ entity: () => Tag, cascade: [Cascade.PERSIST] }) tags = new Collection<Tag>(this); }`,
    `${mikro}class Order { @OneToMany({ entity: () => Line, mappedBy: 'order', cascade: [Cascade.ALL] }) lines = new Collection<Line>(this); }`,
    `${mikro}const Post = defineEntity({ name: 'Post', properties: (p) => ({ tags: p.manyToMany(() => Tag).cascade(Cascade.PERSIST) }) });`,
    `${typeorm}new EntitySchema({ name: 'post', relations: { tags: { type: 'many-to-many', target: 'tag', cascade: ['insert'] } } });`,
    'function ManyToMany(options) { return options; }\nclass Post { @ManyToMany({ cascade: true }) tags; }',
  ],
  invalid: [
    flagged(
      `${typeorm}class Post { @ManyToMany(() => Tag, { cascade: ['remove'] as const }) tags: Tag[]; }`,
      'typeormCascade',
    ),
    flagged(
      `${typeorm}const removing = ['insert', 'remove'] as const;\nclass Post { @ManyToMany(() => Tag, { cascade: removing }) tags: Tag[]; }`,
      'typeormCascade',
    ),
    flagged(
      `${mikro}class Post { @ManyToMany({ entity: () => Tag, cascade: [Cascade.ALL as Cascade] }) tags = new Collection<Tag>(this); }`,
      'mikroOrmCascade',
    ),
    flagged(
      "import * as o from '@mikro-orm/core';\nclass Post { @o.ManyToMany(() => Tag, { cascade: [o.Cascade.ALL] }) tags = new o.Collection<Tag>(this); }",
      'mikroOrmCascade',
    ),
    flagged(
      "const o = require('@mikro-orm/core');\nclass Post { @o.ManyToMany(() => Tag, { cascade: [o.Cascade.REMOVE] }) tags; }",
      'mikroOrmCascade',
    ),
    flagged(
      `${typeorm}class Post { @ManyToMany(() => Tag, { cascade: true }) @JoinTable() tags: Tag[]; }`,
      'typeormCascade',
    ),
    flagged(
      `${typeorm}class Post { @ManyToMany(() => Tag, (t) => t.posts, { cascade: ['insert', 'remove'] }) tags: Tag[]; }`,
      'typeormCascade',
    ),
    flagged(
      `${typeorm}class Post { @ManyToMany(() => Tag, { cascade: ['soft-remove'] }) tags: Tag[]; }`,
      'typeormCascade',
    ),
    flagged(
      `${typeorm}new EntitySchema({ name: 'post', relations: { tags: { type: 'many-to-many', target: 'tag', cascade: true } } });`,
      'typeormCascade',
    ),
    flagged(
      `${mikro}class Post { @ManyToMany({ entity: () => Tag, cascade: [Cascade.ALL] }) tags = new Collection<Tag>(this); }`,
      'mikroOrmCascade',
    ),
    flagged(
      `${mikro}class Post { @ManyToMany(() => Tag, 'posts', { cascade: [Cascade.PERSIST, Cascade.REMOVE] }) tags = new Collection<Tag>(this); }`,
      'mikroOrmCascade',
    ),
    flagged(
      `${mikro}class Post { @ManyToMany({ entity: () => Tag, cascade: ['remove'] }) tags = new Collection<Tag>(this); }`,
      'mikroOrmCascade',
    ),
    flagged(
      `${mikro}new EntitySchema({ name: 'Post', properties: { tags: { kind: 'm:n', entity: () => Tag, cascade: [Cascade.ALL] } } });`,
      'mikroOrmCascade',
    ),
    flagged(
      `${mikro}const Post = defineEntity({ name: 'Post', properties: (p) => ({ tags: p.manyToMany(() => Tag).cascade(Cascade.REMOVE) }) });`,
      'mikroOrmCascade',
    ),
  ],
});
