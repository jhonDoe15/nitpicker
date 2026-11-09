import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import { FOREIGN_KEY_RULE, withUnindexedForeignKeys } from './key-filter.mjs';

const roots = [];
const SOURCE_ROOTS = ['src/main/java'];
const ORDER = `package shop;

@Entity
class Order extends Payment {
  @ManyToOne Customer customer;
}
`;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'jpa-keys-'));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  for (const [name, text] of Object.entries(files)) {
    const file = pathInside(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

function finding(file, line, rule = FOREIGN_KEY_RULE) {
  return { tool: 'pmd', rule, path: file, location: { line } };
}

function kept(root, findings) {
  return withUnindexedForeignKeys(findings, { projectRoot: root, sourceRoots: SOURCE_ROOTS }).map(
    ({ path: file, location }) => `${file}:${String(location.line)}`,
  );
}

describe('withUnindexedForeignKeys', () => {
  it('keeps the finding of an entity that has no parent entity', () => {
    const root = project({
      'src/main/java/shop/Order.java': ORDER,
      'src/main/java/shop/Payment.java': '@MappedSuperclass\nabstract class Payment {}\n',
    });

    expect(kept(root, [finding('src/main/java/shop/Order.java', 5)])).toEqual([
      'src/main/java/shop/Order.java:5',
    ]);
  });

  it('drops the finding of a single-table subclass, whose index belongs on the root table', () => {
    const root = project({
      'src/main/java/shop/Order.java': ORDER,
      'src/main/java/shop/Payment.java': '@Entity\nclass Payment extends Base {}\n',
      'src/main/java/shop/Base.java': '@MappedSuperclass\nabstract class Base {}\n',
    });

    expect(kept(root, [finding('src/main/java/shop/Order.java', 5)])).toEqual([]);
  });

  it('keeps the finding of a subclass with its own table', () => {
    const root = project({
      'src/main/java/shop/Order.java': ORDER,
      'src/main/java/shop/Payment.java':
        '@Entity\n@Inheritance(strategy = InheritanceType.JOINED)\nclass Payment {}\n',
    });

    expect(kept(root, [finding('src/main/java/shop/Order.java', 5)])).toEqual([
      'src/main/java/shop/Order.java:5',
    ]);
  });

  it('leaves foreign keys to the migration check when the project has migrations', () => {
    const root = project({
      'src/main/java/shop/Order.java': ORDER,
      'src/main/resources/db/migration/V1__init.sql': 'create table orders (id bigint);\n',
    });

    expect(kept(root, [finding('src/main/java/shop/Order.java', 5)])).toEqual([]);
  });

  it('drops the findings of a MySQL-only project and keeps other rules', () => {
    const root = project({
      'src/main/java/shop/Order.java': ORDER,
      'build.gradle': "dependencies { runtimeOnly 'com.mysql:mysql-connector-j:9.1.0' }\n",
    });

    expect(
      kept(root, [
        finding('src/main/java/shop/Order.java', 5),
        finding('src/main/java/shop/Order.java', 5, 'JpaLazyFetching'),
      ]),
    ).toEqual(['src/main/java/shop/Order.java:5']);
  });

  it('keeps the findings of a project that names PostgreSQL next to MySQL', () => {
    const root = project({
      'src/main/java/shop/Order.java': ORDER,
      'build.gradle':
        "dependencies {\n  runtimeOnly 'com.mysql:mysql-connector-j:9.1.0'\n  runtimeOnly 'org.postgresql:postgresql:42.7.4'\n}\n",
    });

    expect(kept(root, [finding('src/main/java/shop/Order.java', 5)])).toEqual([
      'src/main/java/shop/Order.java:5',
    ]);
  });
});
