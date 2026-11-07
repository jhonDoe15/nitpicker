import { afterEach, describe, expect, it } from 'vitest';
import { project, removeProjects } from '../test-support/spring-config-projects.mjs';
import { withoutTransactionAwareCacheWrites } from './transaction-aware.mjs';

const FINDINGS = [
  { tool: 'pmd', rule: 'SpringCacheWriteInTransaction', path: 'src/main/java/shop/Prices.java' },
  {
    tool: 'pmd',
    rule: 'SpringLocalCacheWriteInTransaction',
    path: 'src/main/java/shop/Prices.java',
  },
];

function rules(files, sourceRoots = ['src/main/java', 'src/main/kotlin']) {
  return withoutTransactionAwareCacheWrites(FINDINGS, {
    projectRoot: project(files, { jpa: false }),
    roots: sourceRoots,
  }).map(({ rule }) => rule);
}

afterEach(removeProjects);

describe('transaction-aware cache managers', () => {
  it.each([
    ['a proxy around the manager', 'return new TransactionAwareCacheManagerProxy(manager);'],
    ['a decorated cache', 'return new TransactionAwareCacheDecorator(cache);'],
    ['a Redis builder', 'return RedisCacheManager.builder(factory).transactionAware().build();'],
    ['a supporting manager', 'manager.setTransactionAware(true);'],
  ])('drops the Spring Cache finding when the project configures %s', (_, line) => {
    expect(
      rules({ 'src/main/java/shop/CacheConfig.java': `class CacheConfig {\n  ${line}\n}\n` }),
    ).toEqual(['SpringLocalCacheWriteInTransaction']);
  });

  it('reads Kotlin configuration too', () => {
    expect(
      rules({
        'src/main/kotlin/shop/CacheConfig.kt':
          'fun caches(m: CaffeineCacheManager) {\n  m.isTransactionAware = true\n}\n',
      }),
    ).toEqual(['SpringLocalCacheWriteInTransaction']);
  });

  it('keeps every finding when the setting is off, commented out or outside the source roots', () => {
    expect(
      rules({
        'src/main/java/shop/CacheConfig.java': [
          'class CacheConfig {',
          '  // manager.setTransactionAware(true);',
          '  void off(M m) { m.setTransactionAware(false); }',
          '}',
        ].join('\n'),
        'docs/TransactionAwareCacheManagerProxy.java':
          'class TransactionAwareCacheManagerProxy {}\n',
      }),
    ).toEqual(['SpringCacheWriteInTransaction', 'SpringLocalCacheWriteInTransaction']);
  });
});
