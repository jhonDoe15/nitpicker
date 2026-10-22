package shop.orders;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import shop.catalog.Product;
import shop.catalog.ProductRepository;

@Service
public class OrderService {
  private final ProductRepository products;
  private final EntityManager entityManager;
  private final ApplicationContext context; // violation: SpringNoServiceLocator
  private int processed; // NOPMD is ignored // violation: SpringImmutableBeans

  @PersistenceContext private EntityManager sharedEntityManager;

  @Autowired private Clock clock; // violation: SpringConstructorInjection, SpringImmutableBeans

  @Value("${shop.region}") private String region; // violation: SpringConstructorInjection, SpringImmutableBeans

  public OrderService(
      ProductRepository products,
      EntityManager entityManager,
      ApplicationContext context, // violation: SpringNoServiceLocator
      @Lazy Clock lazyClock, // violation: SpringNoLazyInjection
      @Value("${shop.currency}") String currency) { // violation: SpringTypedConfiguration
    this.products = products;
    this.entityManager = entityManager;
    this.context = context;
  }

  @Autowired // violation: SpringConstructorInjection
  void setClock(Clock clock) {}

  @Transactional
  public void importAll(List<Product> incoming) {
    for (Product product : incoming) {
      products.save(product); // violation: SpringDataNoSaveInLoop
    }
    incoming.forEach(product -> entityManager.persist(product)); // violation: SpringDataNoSaveInLoop
    incoming.forEach(products::save); // violation: SpringDataNoSaveInLoop
    products.saveAll(incoming);
    products.flush(); // violation: SpringDataNoFlush
    recalculate(); // violation: SpringProxySelfCall
    this.recalculate(); // violation: SpringProxySelfCall
    helper();
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW) // violation: SpringNoRequiresNew
  public void recalculate() {
    try {
      helper();
    } catch (RuntimeException e) { // violation: SpringNoSwallowedTransactionException
      processed = 0;
    }
    try {
      helper();
    } catch (IllegalArgumentException e) {
      throw new IllegalStateException(e);
    }
  }

  @Transactional
  public int parseQuantity(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      return 0;
    }
  }

  @Transactional
  public void restock(List<Product> incoming) {
    reserve();
    for (List<Product> page : List.of(incoming)) {
      products.saveAll(page);
    }
    int persisted = 0;
    for (Product product : incoming) {
      entityManager.persist(product);
      persisted += 1;
      if (persisted % 50 == 0) {
        entityManager.flush();
        entityManager.clear();
      }
    }
  }

  @Transactional
  public void restockEach(List<Product> incoming) {
    for (Product product : incoming) {
      entityManager.persist(product); // violation: SpringDataNoSaveInLoop
      entityManager.flush(); // violation: SpringDataNoFlush
      entityManager.clear();
    }
  }

  @Transactional
  public long importStreamed(List<Product> incoming) {
    long kept = incoming.stream().filter(product -> products.save(product) != null).count(); // violation: IoCallInLoop
    long mapped = incoming.stream().flatMap(product -> Stream.of(products.save(product))).count(); // violation: SpringDataNoSaveInLoop
    Product last =
        incoming.stream().reduce(null, (previous, product) -> products.save(product), (a, b) -> b); // violation: IoCallInLoop
    return kept + mapped + (last == null ? 0 : 1);
  }

  @Transactional
  public void reserve() {}

  @Value("${shop.limit}") // violation: SpringConstructorInjection
  public void setLimit(int limit) {}

  @Transactional // violation: SpringProxyMethodVisibility
  void packageVisible() {}

  @Transactional // violation: SpringProxyMethodVisibility
  public final void finalMethod() {}

  @Async // violation: SpringAsyncExecutor
  public void notifyCustomer() {} // violation: SpringAsyncExecutor

  @Async("mailExecutor")
  public CompletableFuture<Void> sendMail() {
    return CompletableFuture.completedFuture(null);
  }

  @Scheduled(fixedRate = 1000) // violation: SpringScheduledFixedDelay
  public void poll() {}

  @Scheduled(fixedDelay = 1000)
  public void sweep() {
    String home = System.getenv("HOME"); // violation: SpringTypedConfiguration
    String userHome = System.getProperty("user.home");
  }

  @Transactional
  public void touch(Long id) {
    var unused = products.findById(id).map(products::save);
    products.findById(id).ifPresent(product -> products.save(product));
  }

  @Transactional
  public void resetEach(List<Long> ids) {
    for (Long id : ids) {
      entityManager.createQuery("update Product p set p.version = 0 where p.id = :id").setParameter("id", id).executeUpdate(); // violation: SpringDataRowWriteInLoop
    }
    for (Long id : ids) {
      entityManager // violation: SpringDataRowWriteInLoop
          .createQuery("update Product p set p.version = 0 where p.id = :id")
          .setParameter("id", id)
          .executeUpdate();
    }
    entityManager.createQuery("update Product p set p.version = 0 where p.id in :ids").setParameter("ids", ids).executeUpdate();
  }

  private void helper() {}

  public interface Clock {}
}
