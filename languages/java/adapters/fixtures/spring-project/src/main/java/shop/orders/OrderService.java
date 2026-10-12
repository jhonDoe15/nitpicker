package shop.orders;

import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.concurrent.CompletableFuture;
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
  private int processed; // violation: SpringImmutableBeans

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
    } catch (IllegalStateException e) { // violation: SpringNoSwallowedTransactionException
      processed = 0;
    }
    try {
      helper();
    } catch (IllegalArgumentException e) {
      throw new IllegalStateException(e);
    }
  }

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
  }

  private void helper() {}

  public interface Clock {}
}
