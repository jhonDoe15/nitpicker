package shop.orders;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.catalog.Product;
import shop.catalog.ProductRepository;

@Service
public class TxService {
  private final ProductRepository products;

  public TxService(ProductRepository products) {
    this.products = products;
  }

  @Transactional
  public void loadFile(Path path) throws IOException { // violation: SpringTransactionalCheckedRollback
    products.saveAll(List.of());
  }

  @Transactional(readOnly = false)
  public void loadFlag(Path path) throws Exception { // violation: SpringTransactionalCheckedRollback
    products.saveAll(List.of());
  }

  @Transactional(rollbackFor = Exception.class)
  public void loadChecked(Path path) throws IOException {
    products.saveAll(List.of());
  }

  @Transactional(readOnly = true)
  public String read(Path path) throws IOException {
    return path.toString();
  }

  @Transactional
  public void unchecked(Path path) throws IllegalStateException {
    products.saveAll(List.of());
  }

  public void plain(Path path) throws IOException {}

  public void evictAll(List<Long> ids) {
    ids.forEach(this::evict); // violation: SpringProxySelfCall
  }

  @CacheEvict("products")
  public void evict(Long id) {}

  public void evictTwice(List<Long> ids) {
    ids.forEach(this::describe);
  }

  public void describe(Long id) {}

  @Transactional
  public void audit() {
    record();
  }

  private void record() {
    try {
      products.flush(); // violation: SpringDataNoFlush
    } catch (DataAccessException e) { // violation: SpringNoSwallowedTransactionException
      log();
    }
  }

  private void log() {}

  private void unrelated() {
    try {
      log();
    } catch (RuntimeException e) {
      log();
    }
  }
}
