package shop.imports;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.catalog.Product;
import shop.catalog.ProductRepository;
import shop.catalog.StockRepository;

@Service
@Transactional(readOnly = true)
public class ReadOnlyJobs {
  private final ProductRepository products;
  private final StockRepository stock;

  public ReadOnlyJobs(ProductRepository products, StockRepository stock) {
    this.products = products;
    this.stock = stock;
  }

  public void references(List<Product> incoming) {
    incoming.forEach(products::save); // violation: SpringTransactionalReadOnlyWrite, SpringDataNoSaveInLoop
  }

  public int sell(Long id) {
    return stock.markSold(id); // violation: SpringTransactionalReadOnlyWrite
  }

  @jakarta.transaction.Transactional // violation: SpringTransactionalAnnotation
  public void jta(Product product) {
    products.save(product);
  }

  public List<Product> list() {
    return products.findAll();
  }
}
