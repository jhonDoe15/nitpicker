import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import { withUnindexedForeignKeys } from './key-filter.mjs';
import { FOREIGN_KEY_RULE, foreignKeyGate } from './key-gate.mjs';

const roots = [];
const SOURCE_ROOTS = ['src/main/java'];
const ORDER_FILE = 'src/main/java/shop/Order.java';
const ORDER = `package shop;

@Entity
class Order extends Payment {
  static class Builder {
    String note = "a class name";
  }

  @ManyToOne Customer customer;
}
`;
const MAPPED = '@MappedSuperclass\nabstract class Payment {}\n';
const SINGLE_TABLE = '@Entity\nclass Payment extends Base {}\n';
const JOINED = '@Entity\n@Inheritance(strategy = InheritanceType.JOINED)\nclass Payment {}\n';
const MIGRATION_WITH_KEY =
  'create table orders (id bigint primary key, customer_id bigint references customers (id));\n';
const MYSQL_BUILD = "dependencies { runtimeOnly 'com.mysql:mysql-connector-j:9.1.0' }\n";

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'jpa-keys-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    const file = pathInside(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

function finding(rule = FOREIGN_KEY_RULE) {
  return { tool: 'pmd', rule, path: ORDER_FILE, location: { line: 9 } };
}

function kept(files, findings = [finding()]) {
  const root = project({ [ORDER_FILE]: ORDER, ...files });
  return withUnindexedForeignKeys(findings, { projectRoot: root, sourceRoots: SOURCE_ROOTS }).map(
    ({ rule }) => rule,
  );
}

describe('withUnindexedForeignKeys', () => {
  it.each([
    [
      'an entity whose parent is a mapped superclass',
      { 'src/main/java/shop/Payment.java': MAPPED },
    ],
    ['a subclass with its own joined table', { 'src/main/java/shop/Payment.java': JOINED }],
    [
      'a project whose only migration-like files declare no foreign key',
      {
        'src/main/java/shop/migration/Importer.java': 'class Importer {}\n',
        'src/main/resources/db/migration/V1__init.sql': 'create table notes (id bigint);\n',
      },
    ],
    [
      'a project that names MySQL only in its test resources',
      {
        'src/main/resources/application.yml': 'url: jdbc:postgresql://db/shop\n',
        'src/test/resources/application-test.yml': 'url: jdbc:mysql://db/shop\n',
      },
    ],
    [
      'a project that names PostgreSQL next to MySQL',
      {
        'build.gradle': `${MYSQL_BUILD}dependencies { runtimeOnly 'org.postgresql:postgresql' }\n`,
      },
    ],
  ])('keeps the finding of %s', (_, files) => {
    expect(kept(files)).toEqual([FOREIGN_KEY_RULE]);
  });

  it.each([
    [
      'a single-table subclass, whose index belongs on the root table, past a nested class',
      {
        'src/main/java/shop/Payment.java': SINGLE_TABLE,
        'src/main/java/shop/Base.java': '@MappedSuperclass\nabstract class Base {}\n',
      },
    ],
    [
      'a project whose migrations declare foreign keys, which the hygiene check reads',
      { 'src/main/resources/db/migration/V1__init.sql': MIGRATION_WITH_KEY },
    ],
    [
      'a project whose Liquibase YAML changelog declares foreign keys',
      {
        'src/main/resources/db/changelog/orders.yaml': [
          'databaseChangeLog:',
          '  - changeSet:',
          '      id: 1',
          '      changes:',
          '        - addForeignKeyConstraint:',
          '            baseTableName: orders',
          '            baseColumnNames: customer_id',
          '            referencedTableName: customers',
          '            referencedColumnNames: id',
          '',
        ].join('\n'),
      },
    ],
    ['a MySQL-only project', { 'build.gradle': MYSQL_BUILD }],
    [
      'a project that names MySQL in its version catalog',
      {
        'build.gradle': 'dependencies { runtimeOnly libs.mysql }\n',
        'gradle/libs.versions.toml': '[libraries]\nmysql = "com.mysql:mysql-connector-j:9.1.0"\n',
      },
    ],
  ])('drops the finding of %s', (_, files) => {
    expect(kept(files)).toEqual([]);
  });

  it('keeps the findings of other rules', () => {
    expect(kept({ 'build.gradle': MYSQL_BUILD }, [finding('JpaLazyFetching')])).toEqual([
      'JpaLazyFetching',
    ]);
  });
});

describe('foreignKeyGate', () => {
  it('checks every file of a project directory that does not exist', () => {
    expect(foreignKeyGate(path.join(tmpdir(), 'nitpicker-missing-project'))(ORDER_FILE)).toBe(true);
  });

  it('reads the project once and answers per file from the nearest build', () => {
    const root = project({
      'shop/build.gradle': MYSQL_BUILD,
      'billing/build.gradle': "dependencies { runtimeOnly 'org.postgresql:postgresql' }\n",
    });
    const gate = foreignKeyGate(root);

    expect([gate('shop/src/main/java/A.java'), gate('billing/src/main/java/B.java')]).toEqual([
      false,
      true,
    ]);
  });
});
