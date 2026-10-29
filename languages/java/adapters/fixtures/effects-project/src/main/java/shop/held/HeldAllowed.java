package shop.held;

import java.math.BigDecimal;
import java.util.concurrent.locks.ReentrantLock;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import shop.orders.OrderRepository;
import shop.prices.PriceSource;

public class HeldAllowed {
  private final OrderRepository repository;
  private final PriceSource prices;
  private final TransactionTemplate transactions;
  private final ReentrantLock lock = new ReentrantLock();
  private int count;
  private BigDecimal cached;

  public HeldAllowed(OrderRepository repository, PriceSource prices, TransactionTemplate transactions) {
    this.repository = repository;
    this.prices = prices;
    this.transactions = transactions;
  }

  @Transactional
  public BigDecimal remoteOnly(Long id) {
    return prices.priceOf(id);
  }

  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public BigDecimal suspended(Long id) {
    repository.findById(id).orElseThrow();
    return prices.priceOf(id);
  }

  public BigDecimal before(Long id) {
    BigDecimal price = prices.priceOf(id);
    transactions.executeWithoutResult(status -> repository.deleteById(id));
    return price;
  }

  public BigDecimal afterUnlock(Long id) {
    lock.lock();
    try {
      count++;
    } finally {
      lock.unlock();
    }
    return prices.priceOf(id);
  }

  public BigDecimal cachedUnderLock(Long id) {
    lock.lock();
    try {
      if (cached != null) {
        return cached;
      }
      cached = prices.priceOf(id);
      return cached;
    } finally {
      lock.unlock();
    }
  }

  public synchronized BigDecimal cachedSynchronized(Long id) {
    if (cached == null) {
      cached = prices.priceOf(id);
    }
    return cached;
  }
}
