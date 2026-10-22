package shop.orders;

import jakarta.persistence.EntityManager;
import java.io.IOException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.catalog.Product;
import shop.catalog.ProductRepository;

@Service
@Transactional(readOnly = true)
public class TxAll {
  private final ProductRepository products;
  private final EntityManager entityManager;

  public TxAll(ProductRepository products, EntityManager entityManager) {
    this.products = products;
    this.entityManager = entityManager;
  }

  public Product find(Long id) {
    return products.findById(id).orElseThrow();
  }

  public void reprice(Product product) {
    products.save(product); // violation: SpringTransactionalReadOnlyWrite
  }

  @Transactional
  public void update(Product product) {
    products.save(product);
  }

  @Transactional(readOnly = true)
  public void explicit(Product product) {
    entityManager.persist(product); // violation: SpringTransactionalReadOnlyWrite
  }

  public void load() throws IOException {}
}

@Service
@Transactional
class TxEverything {
  public void run() throws IOException {} // violation: SpringTransactionalCheckedRollback
}
