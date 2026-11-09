import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { trackedFiles } from '../tracked-files.mjs';
import { foreignKeyIndexFindings } from './foreign-key-index.mjs';

const { createGitRepository } = useGitFixtures();
const FLYWAY = 'src/main/resources/db/migration';

function check(files) {
  const { root } = createGitRepository(files);
  return foreignKeyIndexFindings('repository-hygiene', {
    projectRoot: root,
    files: trackedFiles(root),
  });
}

function summary(findings) {
  return findings.map(
    ({ path, identity, location }) =>
      `${path}:${String(location.line)} ${identity.split('|').at(-1)}`,
  );
}

const ORDERS = [
  'create table customers (id bigint primary key);',
  'create table orders (',
  '  id bigint primary key,',
  '  customer_id bigint not null references customers (id),',
  '  shop_id bigint not null,',
  '  courier_id bigint,',
  '  constraint fk_shop foreign key (shop_id) references shops (id),',
  '  constraint fk_courier foreign key (courier_id) references couriers (id)',
  ');',
  'create index orders_shop_created on orders (shop_id, created_at);',
  'create index orders_created_courier on orders (created_at, courier_id);',
  '',
].join('\n');

describe('foreign keys without an index in migrations', () => {
  it('reports a foreign key with no index, or one whose index starts with another column', () => {
    const findings = check({ [`${FLYWAY}/V1__orders.sql`]: ORDERS });

    expect(summary(findings)).toEqual([
      `${FLYWAY}/V1__orders.sql:4 orders(customer_id)`,
      `${FLYWAY}/V1__orders.sql:8 orders(courier_id)`,
    ]);
    expect(findings[0]).toMatchObject({
      tool: 'repository-hygiene',
      rule: 'foreign-key-index',
      classification: 'enforceable',
    });
    expect(findings[0].message).toBe(
      `${FLYWAY}/V1__orders.sql adds a foreign key on orders (customer_id) (line 4) and no migration creates an index that starts with it. ` +
        "Add `CREATE INDEX ON orders (customer_id)` in a migration, or the ORM's index on the field followed by a generated migration. " +
        'PostgreSQL does not index a foreign-key column by itself, so every delete of a referenced row, and every join or lookup by the column, scans the whole table once it grows. ' +
        'An exception fits only when the table is known to stay small or the index is created outside the repository. ' +
        `If this is intended, add {"rule":"foreign-key-index","paths":["${FLYWAY}/V1__orders.sql"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
    );
  });

  it('accepts an index a later migration creates, a primary key or a unique constraint that starts with the column', () => {
    expect(
      summary(
        check({
          [`${FLYWAY}/V1__orders.sql`]: ORDERS,
          [`${FLYWAY}/V2__indexes.sql`]: [
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_customer" ON public."orders" USING btree ("customer_id");',
            'ALTER TABLE orders ADD CONSTRAINT orders_courier UNIQUE (courier_id, id);',
            'create table lines (order_id bigint references orders (id), position int, primary key (order_id, position));',
            '',
          ].join('\n'),
        }),
      ),
    ).toEqual([]);
  });

  it('reads Prisma, TypeORM, MikroORM and goose migrations and skips their down parts', () => {
    const findings = check({
      'prisma/migrations/20240101000000_init/migration.sql':
        'ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT;\n',
      'src/migrations/1700000000000-Orders.ts': [
        "import { MigrationInterface, QueryRunner } from 'typeorm';",
        'export class Orders1700000000000 implements MigrationInterface {',
        '  public async up(queryRunner: QueryRunner): Promise<void> {',
        '    await queryRunner.query(`ALTER TABLE "order" ADD CONSTRAINT "FK_1" FOREIGN KEY ("customerId") REFERENCES "customer"("id")`);',
        '    await queryRunner.query(`ALTER TABLE "order" ADD CONSTRAINT "FK_2" FOREIGN KEY ("shopId") REFERENCES "shop"("id")`);',
        '    await queryRunner.query(`CREATE INDEX "IDX_shop" ON "order" ("shopId") `);',
        '  }',
        '  public async down(queryRunner: QueryRunner): Promise<void> {',
        '    await queryRunner.query(`ALTER TABLE "refund" ADD CONSTRAINT "FK_3" FOREIGN KEY ("orderId") REFERENCES "order"("id")`);',
        '  }',
        '}',
        '',
      ].join('\n'),
      'db/migrations/Migration20240101000000.ts':
        'export class Migration20240101000000 extends Migration {\n  async up() {\n    this.addSql(\'alter table "book" add constraint "book_author_id_foreign" foreign key ("author_id") references "author" ("id");\');\n  }\n}\n',
      'migrations/00002_lines.sql':
        '-- +goose Up\nalter table lines add column order_id bigint references orders(id);\ncreate index on lines (order_id);\n-- +goose Down\nalter table refunds add column order_id bigint references orders(id);\n',
    });

    expect(summary(findings)).toEqual([
      'db/migrations/Migration20240101000000.ts:3 book(author_id)',
      'prisma/migrations/20240101000000_init/migration.sql:1 post(authorid)',
      'src/migrations/1700000000000-Orders.ts:4 order(customerid)',
    ]);
  });

  it('reads Liquibase XML and YAML changelogs', () => {
    const findings = check({
      'src/main/resources/db/changelog/orders.xml': [
        '<databaseChangeLog>',
        '  <changeSet id="1" author="shop">',
        '    <createTable tableName="orders">',
        '      <column name="id" type="bigint"><constraints primaryKey="true"/></column>',
        '      <column name="customer_id" type="bigint"><constraints foreignKeyName="fk_customer" references="customers(id)"/></column>',
        '      <column name="shop_id" type="bigint"/>',
        '    </createTable>',
        '    <addForeignKeyConstraint baseTableName="orders" baseColumnNames="shop_id" constraintName="fk_shop" referencedTableName="shops" referencedColumnNames="id"/>',
        '    <createIndex tableName="orders" indexName="orders_shop"><column name="shop_id"/></createIndex>',
        '    <rollback><addForeignKeyConstraint baseTableName="refunds" baseColumnNames="order_id" referencedTableName="orders" referencedColumnNames="id"/></rollback>',
        '  </changeSet>',
        '</databaseChangeLog>',
        '',
      ].join('\n'),
      'src/main/resources/db/changelog/lines.yaml': [
        'databaseChangeLog:',
        '  - changeSet:',
        '      id: 2',
        '      author: shop',
        '      changes:',
        '        - addForeignKeyConstraint:',
        '            baseTableName: lines',
        '            baseColumnNames: order_id',
        '            referencedTableName: orders',
        '            referencedColumnNames: id',
        '        - createIndex:',
        '            tableName: lines',
        '            columns:',
        '              - column:',
        '                  name: product_id',
        '',
      ].join('\n'),
    });

    expect(summary(findings)).toEqual([
      'src/main/resources/db/changelog/lines.yaml:8 lines(order_id)',
      'src/main/resources/db/changelog/orders.xml:5 orders(customer_id)',
    ]);
  });

  it('reads Alembic operations, batch operations and SQL it executes', () => {
    const findings = check({
      'alembic/versions/0001_orders.py': [
        'def upgrade():',
        '    op.create_table(',
        '        "orders",',
        '        sa.Column("id", sa.Integer(), primary_key=True),',
        '        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),',
        '        sa.Column("shop_id", sa.Integer(), sa.ForeignKey("shops.id"), index=True),',
        '        sa.ForeignKeyConstraint(["courier_id"], ["couriers.id"]),',
        '    )',
        '    op.create_index("ix_orders_courier", "orders", ["courier_id", "id"])',
        '    with op.batch_alter_table("lines") as batch_op:',
        '        batch_op.add_column(sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id")))',
        '    op.execute("ALTER TABLE refunds ADD FOREIGN KEY (order_id) REFERENCES orders (id)")',
        '',
        '',
        'def downgrade():',
        '    op.create_foreign_key("fk", "notes", "orders", ["order_id"], ["id"])',
        '',
      ].join('\n'),
      'shop/migrations/0002_orders.py':
        'operations = [migrations.AddField("order", "customer", models.ForeignKey("Customer", on_delete=models.CASCADE))]\n',
    });

    expect(summary(findings)).toEqual([
      'alembic/versions/0001_orders.py:5 orders(customer_id)',
      'alembic/versions/0001_orders.py:11 lines(order_id)',
      'alembic/versions/0001_orders.py:12 refunds(order_id)',
    ]);
  });

  it('leaves MySQL and MariaDB projects and MySQL migrations alone', () => {
    const mysql = check({
      'package.json': JSON.stringify({ dependencies: { mysql2: '3.0.0', typeorm: '0.3.0' } }),
      [`${FLYWAY}/V1__orders.sql`]: ORDERS,
    });
    const dialect = check({
      [`${FLYWAY}/V1__orders.sql`]:
        'CREATE TABLE `orders` (`id` int, `customer_id` int, FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)) ENGINE=InnoDB;\n',
    });
    const both = check({
      'package.json': JSON.stringify({ dependencies: { mysql2: '3.0.0', pg: '8.0.0' } }),
      [`${FLYWAY}/V1__orders.sql`]: ORDERS,
    });

    expect([mysql, dialect, summary(both).length]).toEqual([[], [], 2]);
  });
});

describe('Prisma relations without an index', () => {
  const SCHEMA = (datasource) =>
    [
      'datasource db {',
      ...datasource,
      '}',
      '',
      'model Post {',
      '  id       Int  @id',
      '  author   User @relation(fields: [authorId], references: [id])',
      '  authorId Int',
      '  editor   User @relation("edits", fields: [editorId], references: [id])',
      '  editorId Int',
      '  shop     Shop @relation(fields: [shopId], references: [id])',
      '  shopId   Int',
      '  @@index([editorId, createdAt])',
      '  @@index([createdAt, shopId])',
      '}',
      '',
    ].join('\n');

  it('reports a relation whose fields no index starts with', () => {
    expect(
      summary(
        check({
          'prisma/schema.prisma': SCHEMA([
            '  provider = "postgresql"',
            '  url = env("DATABASE_URL")',
          ]),
        }),
      ),
    ).toEqual(['prisma/schema.prisma:8 Post.author', 'prisma/schema.prisma:12 Post.shop']);
  });

  it('checks MySQL only with relationMode prisma, and leaves a schema with migrations to them', () => {
    const plain = check({ 'prisma/schema.prisma': SCHEMA(['  provider = "mysql"']) });
    const emulated = check({
      'prisma/schema.prisma': SCHEMA(['  provider = "mysql"', '  relationMode = "prisma"']),
    });
    const migrated = check({
      'prisma/schema.prisma': SCHEMA(['  provider = "postgresql"']),
      'prisma/migrations/20240101000000_init/migration.sql':
        'CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");\n',
    });

    expect([plain, summary(emulated).length, migrated]).toEqual([[], 2, []]);
  });
});
