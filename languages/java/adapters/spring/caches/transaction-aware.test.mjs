import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withoutTransactionAwareCacheWrites } from './transaction-aware.mjs';

const roots = [];
const FINDINGS = [
  { tool: 'pmd', rule: 'SpringCacheWriteInTransaction', path: 'src/main/java/shop/Prices.java' },
  {
    tool: 'pmd',
    rule: 'SpringLocalCacheWriteInTransaction',
    path: 'src/main/java/shop/Prices.java',
  },
];

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'cache-aware-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function rules(files, sourceRoots = ['src/main/java', 'src/main/kotlin']) {
  return withoutTransactionAwareCacheWrites(FINDINGS, {
    projectRoot: project(files),
    roots: sourceRoots,
  }).map(({ rule }) => rule);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

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
        'src/main/java/shop/CacheConfig.java':
          'class CacheConfig {\n  // manager.setTransactionAware(true);\n  void off(M m) { m.setTransactionAware(false); }\n}\n',
        'docs/TransactionAwareCacheManagerProxy.java':
          'class TransactionAwareCacheManagerProxy {}\n',
      }),
    ).toEqual(['SpringCacheWriteInTransaction', 'SpringLocalCacheWriteInTransaction']);
  });
});
