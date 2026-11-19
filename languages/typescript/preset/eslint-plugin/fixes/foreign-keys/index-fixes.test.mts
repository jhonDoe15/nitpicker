import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';
import { schemaProject } from '../../rules/foreign-keys/test-support/schema-projects.mts';
import { rule } from '../../rules/foreign-keys/no-unindexed-foreign-key.mts';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';

function manifest(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    dependencies: {
      typeorm: '1.0.0',
      pg: '1.0.0',
      '@mikro-orm/core': '1.0.0',
      '@mikro-orm/postgresql': '1.0.0',
    },
    ...extra,
  });
}

const plain = schemaProject({ 'package.json': manifest() });
const scripted = schemaProject({
  'package.json': manifest({ scripts: { 'migration:run': 'typeorm migration:run' } }),
});
const mikroMigrations = schemaProject({
  'package.json': manifest({ devDependencies: { '@mikro-orm/migrations': '1.0.0' } }),
});
const configured = schemaProject({
  'package.json': manifest(),
  'src/data-source.ts': 'export const options = { synchronize: false };\n',
});
afterAll(() => {
  for (const root of [plain, scripted, mikroMigrations, configured]) {
    rmSync(root, { recursive: true, force: true });
  }
});

const TYPEORM = "import { Entity, ManyToOne } from 'typeorm';\n";
const TYPEORM_INDEXED = "import { Entity, ManyToOne, Index } from 'typeorm';\n";
const MIKRO = "import { Entity, ManyToOne } from '@mikro-orm/core';\n";
const PROPERTY = { TypeORM: 'customer', MikroORM: 'author' } as const;

type Orm = keyof typeof PROPERTY;

function report(orm: Orm, suggestions: { messageId: string; output: string }[]) {
  return [
    {
      messageId: orm,
      data: { property: PROPERTY[orm], columns: '' },
      ...(suggestions.length === 0 ? {} : { suggestions }),
    },
  ];
}

function suggested(root: string, orm: Orm, code: string, output: string) {
  return {
    code,
    filename: path.join(root, 'src/order.ts'),
    errors: report(orm, [{ messageId: 'addIndex', output }]),
  };
}

function declined(root: string, orm: Orm, code: string) {
  return { code, filename: path.join(root, 'src/order.ts'), errors: report(orm, []) };
}

const order = (head: string, body: string) =>
  `${head}@Entity() class Order { ${body} customer: Customer; }`;
const abstractOrder = (head: string, body: string) =>
  `${head}@Entity() abstract class Order { ${body} customer: Customer; }`;
const book = (body: string, head = MIKRO) =>
  `${head}@Entity() class Book { ${body} author!: Author; }`;
const namespaced = (body: string) =>
  `import * as orm from 'typeorm';\n@orm.Entity() class Order { ${body} customer: Customer; }`;
const stacked = (head: string, first: string) =>
  `${head}@Entity() class Order {\n  ${first}\n  @JoinColumn({ name: 'customer_id' })\n  customer: Customer;\n}`;

typescriptRuleTester().run('no-unindexed-foreign-key suggestion', rule, {
  valid: [],
  invalid: [
    suggested(
      plain,
      'TypeORM',
      order(TYPEORM, '@ManyToOne(() => Customer)'),
      order(TYPEORM_INDEXED, '@Index() @ManyToOne(() => Customer)'),
    ),
    suggested(
      plain,
      'TypeORM',
      order(TYPEORM_INDEXED, '@ManyToOne(() => Customer)'),
      order(TYPEORM_INDEXED, '@Index() @ManyToOne(() => Customer)'),
    ),
    suggested(
      plain,
      'TypeORM',
      namespaced('@orm.ManyToOne(() => Customer)'),
      namespaced('@orm.Index() @orm.ManyToOne(() => Customer)'),
    ),
    suggested(
      plain,
      'TypeORM',
      stacked(
        "import { Entity, JoinColumn, ManyToOne } from 'typeorm';\n",
        '@ManyToOne(() => Customer)',
      ),
      stacked(
        "import { Entity, JoinColumn, ManyToOne, Index } from 'typeorm';\n",
        '@Index()\n  @ManyToOne(() => Customer)',
      ),
    ),
    suggested(
      plain,
      'MikroORM',
      book('@ManyToOne(() => Author)'),
      book('@ManyToOne(() => Author, { index: true })'),
    ),
    suggested(
      plain,
      'MikroORM',
      book('@ManyToOne({ entity: () => Author, nullable: true })'),
      book('@ManyToOne({ entity: () => Author, nullable: true, index: true })'),
    ),
    suggested(
      plain,
      'MikroORM',
      book('@ManyToOne(() => Author, { nullable: true })'),
      book('@ManyToOne(() => Author, { nullable: true, index: true })'),
    ),
    suggested(
      plain,
      'MikroORM',
      book("@ManyToOne('Author')"),
      book("@ManyToOne('Author', { index: true })"),
    ),
    suggested(plain, 'MikroORM', book('@ManyToOne()'), book('@ManyToOne({ index: true })')),
  ],
});

typescriptRuleTester().run('no-unindexed-foreign-key suggestion declined', rule, {
  valid: [],
  invalid: [
    declined(scripted, 'TypeORM', order(TYPEORM, '@ManyToOne(() => Customer)')),
    declined(mikroMigrations, 'MikroORM', book('@ManyToOne(() => Author)')),
    declined(configured, 'TypeORM', order(TYPEORM, '@ManyToOne(() => Customer)')),
    declined(
      plain,
      'TypeORM',
      `${order(TYPEORM, '@ManyToOne(() => Customer)')} export const options = { synchronize: false };`,
    ),
    declined(plain, 'TypeORM', abstractOrder(TYPEORM, '@ManyToOne(() => Customer)')),
    declined(
      plain,
      'TypeORM',
      order(`${TYPEORM}import { Index } from './local';\n`, '@ManyToOne(() => Customer)'),
    ),
    declined(
      plain,
      'TypeORM',
      order("const { Entity, ManyToOne } = require('typeorm');\n", '@ManyToOne(() => Customer)'),
    ),
    declined(plain, 'MikroORM', book("@ManyToOne(() => Author, 'books')")),
    declined(plain, 'MikroORM', book('@ManyToOne(() => Author, (author) => author.books)')),
    declined(plain, 'MikroORM', book('@ManyToOne(() => Author, { ...defaults })')),
    declined(plain, 'MikroORM', book('@ManyToOne(() => Author, { index: false })')),
    declined(plain, 'MikroORM', book('@ManyToOne(() => Author, { nullable: true }, extra)')),
  ],
});
