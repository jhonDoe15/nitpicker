package shop.batches;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.catalog.Product;
import shop.catalog.ProductRepository;
import shop.catalog.StockRepository;

@Service
public class ChunkedWrites {
  private static final String SCOPED = "update Product p set p.version = 0 where p.id = :id and p.id in :scope";
  private static final String CHUNK = "update Product p set p.version = 0 where p.id in :ids";
  private final ProductRepository products;
  private final StockRepository stock;
  private final EntityManager entityManager;

  public ChunkedWrites(ProductRepository products, StockRepository stock, EntityManager entityManager) {
    this.products = products;
    this.stock = stock;
    this.entityManager = entityManager;
  }

  @Transactional
  public void overloads(List<Product> incoming) {
    for (List<Product> page : pages(incoming)) {
      store(page);
    }
    pages(incoming).forEach(page -> store(page));
    for (Product product : incoming) {
      store(product); // violation: SpringDataSaveInLoopHelper
    }
  }

  @Transactional
  public void chunkUpdates(List<Long> ids) {
    for (List<Long> chunk : pages(ids)) {
      entityManager.createQuery("update Product p set p.version = 0 where p.id in :ids")
          .setParameter("ids", chunk)
          .executeUpdate();
    }
    for (Long id : ids) {
      entityManager.createQuery("update Product p set p.version = 0 where p.id = :id") // violation: SpringDataRowWriteInLoop
          .setParameter("id", id)
          .executeUpdate();
      stock.markSold(id); // violation: SpringDataRowWriteInLoop
    }
  }

  @Transactional
  public void clearedLambdas(List<Product> incoming) {
    pages(incoming).forEach(page -> {
      page.forEach(product -> entityManager.persist(product)); // violation: SpringDataNoSaveInLoop
      entityManager.flush();
      entityManager.clear();
    });
    pages(incoming).forEach(page -> {
      products.saveAllAndFlush(page);
      entityManager.clear();
    });
    pages(incoming).forEach(page -> products.saveAllAndFlush(page)); // violation: SpringDataNoFlush
  }

  @Transactional
  public void arrays(List<Product[]> groups) {
    for (Product[] group : groups) {
      products.saveAll(List.of(group));
      List<Product> members = List.of(group);
      products.saveAll(members);
    }
  }

  @Transactional
  public void rowShapes(List<Long> ids, List<List<Long>> chunks, Optional<Long> next) {
    for (Long id : ids) {
      entityManager.createQuery(SCOPED) // violation: SpringDataRowWriteInLoop
          .setParameter("id", id)
          .setParameter("scope", ids)
          .executeUpdate();
      entityManager.createQuery(CHUNK) // violation: SpringDataRowWriteInLoop
          .setParameter("ids", Set.of(id))
          .executeUpdate();
      stock.restock(id, ids); // violation: SpringDataRowWriteInLoop
      next.ifPresent(other -> stock.ship(other)); // violation: SpringDataRowWriteInLoop
      forget(id, ids); // violation: SpringDataSaveInLoopHelper
    }
    for (List<Long> chunk : chunks) {
      Query query = entityManager.createQuery(CHUNK);
      query.setParameter("ids", chunk);
      query.executeUpdate();
      stock.restock(0L, chunk);
    }
  }

  @Transactional
  public void optionalFlush(List<Product> incoming, Optional<Product> extra) {
    for (Product product : incoming) {
      extra.map(other -> products.saveAndFlush(other)).ifPresent(saved -> entityManager.detach(saved));
      entityManager.clear();
    }
  }

  private void forget(Long id, Object context) {
    products.deleteById(id);
  }

  private void store(Product product) {
    products.save(product);
  }

  private void store(List<Product> page) {
    products.saveAll(page);
  }

  private static <T> List<List<T>> pages(List<T> all) {
    List<List<T>> pages = new ArrayList<>();
    pages.add(all);
    return pages;
  }
}
