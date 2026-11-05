package shop.ledger;

import com.github.benmanes.caffeine.cache.Cache;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import shop.catalog.Product;

@Service
@Transactional
public class PriceCache {
  private final LedgerRepository ledger;
  private final CacheManager caches;
  private final Cache<String, Product> recent;
  private final Map<String, Product> byName = new ConcurrentHashMap<>();
  private final Map<String, Integer> codes = new ConcurrentHashMap<>();

  public PriceCache(LedgerRepository ledger, CacheManager caches, Cache<String, Product> recent) {
    this.ledger = ledger;
    this.caches = caches;
    this.recent = recent;
  }

  public void reprice(String name, Product product) {
    ledger.save(product);
    caches.getCache("prices").put(name, product); // violation: SpringCacheWriteInTransaction
    caches.getCache("prices").evict(name); // violation: SpringCacheWriteInTransaction
  }

  public void remember(String name, Product product) {
    recent.put(name, ledger.save(product)); // violation: SpringLocalCacheWriteInTransaction
    recent.asMap().remove(name); // violation: SpringLocalCacheWriteInTransaction
    byName.put(name, ledger.save(product)); // violation: SpringLocalCacheWriteInTransaction
    Product saved = ledger.save(product);
    byName.putIfAbsent(name, saved); // violation: SpringLocalCacheWriteInTransaction
    recent.get(name, key -> ledger.save(product)); // violation: SpringLocalCacheWriteInTransaction
    codes.put(name, saved.hashCode()); // violation: SpringLocalCacheWriteInTransaction
    recent.putAll(Map.of(name, product)); // violation: SpringLocalCacheWriteInTransaction
    recent.invalidateAll(); // violation: SpringLocalCacheWriteInTransaction
    note(name, product);
  }

  public void later(String name, Product product) {
    ledger.save(product);
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            caches.getCache("prices").put(name, product);
            recent.put(name, product);
          }
        });
    afterCommit(() -> recent.invalidate(name));
  }

  public void label(String name, Product product) {
    byName.put(name, product);
  }

  @CachePut("prices") // violation: SpringCacheWriteInTransaction
  public Product refresh(Product product) {
    return ledger.save(product);
  }

  @Caching(put = @CachePut("prices"), evict = @CacheEvict("names")) // violation: SpringCacheWriteInTransaction
  public Product rename(Product product) {
    return ledger.save(product);
  }

  @Transactional(propagation = Propagation.SUPPORTS)
  public Product peek(String name, Product product) {
    caches.getCache("prices").put(name, product);
    return product;
  }

  public static void prime(Cache<String, Product> cache, Product product) {
    cache.put("first", product);
  }

  @CacheEvict(value = "prices", beforeInvocation = true)
  public void drop(Product product) {
    ledger.delete(product);
  }

  @Transactional(readOnly = true)
  public Product warm(String name) {
    Product found = ledger.findById(1L).orElseThrow();
    caches.getCache("prices").put(name, found);
    return found;
  }

  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public void outside(String name, Product product) {
    recent.put(name, ledger.save(product));
  }

  private void note(String name, Product product) {
    recent.invalidate(name); // violation: SpringLocalCacheWriteInTransaction
    byName.remove(name);
  }

  private void afterCommit(Runnable action) {
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            action.run();
          }
        });
  }
}
