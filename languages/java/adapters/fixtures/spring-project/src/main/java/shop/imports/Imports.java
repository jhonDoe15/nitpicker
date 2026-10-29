package shop.imports;

import java.util.List;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.catalog.Product;
import shop.catalog.ProductRepository;
import shop.catalog.StockRepository;

@Service
public class Imports {
  private static final Logger LOG = LoggerFactory.getLogger(Imports.class);
  private final ProductRepository products;
  private final StockRepository stock;

  public Imports(ProductRepository products, StockRepository stock) {
    this.products = products;
    this.stock = stock;
  }

  @Transactional
  public void importRows(List<Product> rows) {
    for (Product row : rows) {
      try {
        importRow(row); // violation: SpringDataSaveInLoopHelper
      } catch (RuntimeException e) { // violation: SpringNoSwallowedTransactionException
        LOG.warn("row failed", e);
      }
    }
  }

  private void importRow(Product row) {
    products.save(row);
  }

  @Transactional
  public void chunked(List<Long> ids) {
    for (List<Long> chunk : List.of(ids)) {
      stock.touchAll(chunk);
    }
  }

  @Transactional(readOnly = true)
  public List<Product> reads(List<Long> ids) {
    for (Long id : ids) {
      products.findById(id).ifPresent(product -> LOG.info("{}", product)); // violation: IoCallInLoop
    }
    ids.forEach(id -> products.findById(id)); // violation: IoCallInLoop
    return ids.stream().map(id -> products.findById(id).orElseThrow()).toList(); // violation: IoCallInLoop
  }

  @Transactional
  public int counted(List<Long> ids) {
    int changed = 0;
    for (Long id : ids) {
      changed += stock.markSold(id); // violation: SpringDataRowWriteInLoop
    }
    for (Long id : ids) {
      int sold = stock.markSold(id); // violation: SpringDataRowWriteInLoop
      changed += sold;
    }
    for (Long id : ids) {
      if (stock.markSold(id) > 0) { // violation: SpringDataRowWriteInLoop
        changed++;
      }
    }
    return changed;
  }

  @Transactional
  public void indirect(List<Product> incoming) {
    Consumer<Product> saver = products::save; // violation: SpringDataNoSaveInLoop
    for (Product product : incoming) {
      saver.accept(product);
    }
    incoming.iterator().forEachRemaining(products::save); // violation: SpringDataNoSaveInLoop
    for (Product product : incoming) {
      List<Product> one = List.of(product);
      products.saveAll(one); // violation: SpringDataBatchOfOne
    }
    List<Product> all = List.copyOf(incoming);
    products.saveAll(all);
  }
}
