package shop.orders;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.catalog.Product;
import shop.catalog.ProductRepository;
import shop.catalog.StockRepository;

@Service
public class BulkService {
  private final ProductRepository products;
  private final StockRepository stock;

  public BulkService(ProductRepository products, StockRepository stock) {
    this.products = products;
    this.stock = stock;
  }

  @Transactional
  public void batchOfOne(List<Product> incoming) {
    for (Product product : incoming) {
      products.saveAll(List.of(product)); // violation: SpringDataBatchOfOne
    }
    incoming.forEach(product -> products.deleteAll(Set.of(product))); // violation: SpringDataBatchOfOne
    for (Product product : incoming) {
      products.saveAll(Collections.singletonList(product)); // violation: SpringDataBatchOfOne
    }
    for (List<Product> page : pages(incoming)) {
      products.saveAll(page);
    }
    products.saveAll(List.of(incoming.get(0)));
    products.saveAll(List.of(incoming.get(0), incoming.get(1)));
  }

  @Transactional
  public void rows(List<Long> ids) {
    for (Long id : ids) {
      stock.touch(id); // violation: SpringDataRowWriteInLoop
    }
    ids.forEach(stock::touch); // violation: SpringDataRowWriteInLoop
    ids.forEach(id -> stock.touch(id)); // violation: SpringDataRowWriteInLoop
    stock.touchAll(ids);
    stock.touch(ids.get(0));
    int total = 0;
    for (Long id : ids) {
      total += stock.countVersion(id);
    }
  }

  @Transactional
  public void helpers(List<Product> incoming) {
    for (Product product : incoming) {
      store(product); // violation: SpringDataSaveInLoopHelper
    }
    incoming.forEach(this::store); // violation: SpringDataSaveInLoopHelper
    incoming.forEach(product -> store(product)); // violation: SpringDataSaveInLoopHelper
    for (Product product : incoming) {
      this.store(product); // violation: SpringDataSaveInLoopHelper
    }
    store(incoming.get(0));
    Optional.of(incoming.get(0)).map(product -> store(product));
    for (Product product : incoming) {
      describe(product);
    }
  }

  private Product store(Product product) {
    return products.save(product);
  }

  private String describe(Product product) {
    return product.toString();
  }

  private static List<List<Product>> pages(List<Product> all) {
    List<List<Product>> pages = new ArrayList<>();
    pages.add(all);
    return pages;
  }

  public long expensive() {
    return products.findAll().stream().filter(product -> product.hashCode() > 0).count(); // violation: SpringDataFilterInQuery
  }

  public int total() {
    return products.findAll().size(); // violation: SpringDataFilterInQuery
  }

  public boolean any() {
    return products.findAll().isEmpty(); // violation: SpringDataFilterInQuery
  }

  public List<String> names() {
    return products.findAll().stream().map(Product::toString).toList();
  }

  public List<Product> sorted() {
    return products.findAll(org.springframework.data.domain.Sort.by("name"));
  }
}
