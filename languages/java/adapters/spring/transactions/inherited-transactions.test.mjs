import { afterEach, describe, expect, it } from 'vitest';
import { project, removeProjects } from '../test-support/spring-config-projects.mjs';
import { withoutInheritedTransactions } from './inherited-transactions.mjs';
import { withSpringTransactionFilters } from './transaction-filters.mjs';

const SERVICE = 'src/main/java/shop/Orders.java';
const REPOSITORY = 'src/main/java/shop/OrderRepository.java';
const FINDINGS = [
  { tool: 'pmd', rule: 'SpringMultiWriteWithoutTransaction', path: SERVICE, location: { line: 4 } },
  {
    tool: 'pmd',
    rule: 'SpringDataWriteWithoutTransaction',
    path: REPOSITORY,
    location: { line: 3 },
  },
  { tool: 'pmd', rule: 'SpringCacheWriteInTransaction', path: SERVICE, location: { line: 4 } },
];

function kept(files) {
  return withoutInheritedTransactions(FINDINGS, {
    projectRoot: project(files, { jpa: false }),
    roots: ['src/main/java'],
  }).map(({ rule }) => rule);
}

const service = (header) =>
  `package shop;\n${header} {\n  class Inner {}\n  public void move() {}\n}\n`;
const repository = (header) => `package shop;\n${header} {\n  void reset();\n}\n`;

afterEach(removeProjects);

describe('transactions inherited from a project supertype', () => {
  it('drops the findings when a superclass or super-interface is @Transactional', () => {
    expect(
      kept({
        [SERVICE]: service('public class Orders extends Base<Order> implements Audited'),
        'src/main/java/shop/Base.java':
          'package shop;\npublic abstract class Base<T> extends Root {}\n',
        'src/main/java/shop/Root.java':
          'package shop;\n@Transactional(rollbackFor = Exception.class)\npublic abstract class Root {}\n',
        [REPOSITORY]: repository(
          'public interface OrderRepository extends Writable, JpaRepository<Order, Long>',
        ),
        'src/main/java/shop/Writable.java':
          'package shop;\n@jakarta.transaction.Transactional\ninterface Writable {}\n',
      }),
    ).toEqual(['SpringCacheWriteInTransaction']);
  });

  it('keeps the findings when no project supertype is @Transactional', () => {
    expect(
      kept({
        [SERVICE]: service('@Service\npublic class Orders extends Base'),
        'src/main/java/shop/Base.java':
          'package shop;\n// @Transactional\npublic class Base extends Base {}\n',
        [REPOSITORY]: repository('interface OrderRepository extends JpaRepository<Order, Long>'),
      }),
    ).toEqual([
      'SpringMultiWriteWithoutTransaction',
      'SpringDataWriteWithoutTransaction',
      'SpringCacheWriteInTransaction',
    ]);
  });

  it('runs with the cache filter over the Java, manifest and Kotlin source roots', () => {
    const projectRoot = project(
      {
        [SERVICE]: service('public class Orders extends Base'),
        'src/main/kotlin/shop/Base.java': 'package shop;\n@Transactional\nclass Base {}\n',
        'src/main/kotlin/shop/CacheConfig.kt':
          'val proxy = TransactionAwareCacheManagerProxy(manager)\n',
      },
      { jpa: false },
    );
    expect(
      withSpringTransactionFilters(FINDINGS, {
        projectRoot,
        allSourceRoots: ['src/main/java'],
        manifest: { kotlinSourceRoots: ['src/main/kotlin'] },
      }).map(({ rule }) => rule),
    ).toEqual(['SpringDataWriteWithoutTransaction']);
  });
});
