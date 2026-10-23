package shop.orders;

import java.util.List;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.catalog.Product;
import shop.catalog.ProductRepository;

@Service
public class VarargsService {
  private final ProductRepository products;

  public VarargsService(ProductRepository products) {
    this.products = products;
  }

  public List<Product> both() {
    return find(1L, 2L); // violation: SpringProxySelfCall
  }

  @Cacheable("products")
  public List<Product> find(Long... ids) {
    return products.findAllById(List.of(ids));
  }

  @Transactional
  public void removeAll() {
    remove(1L, 2L);
  }

  private void remove(Long... ids) {
    try {
      products.deleteAllById(List.of(ids));
    } catch (RuntimeException e) { // violation: SpringNoSwallowedTransactionException
      products.flush(); // violation: SpringDataNoFlush
    }
  }
}
