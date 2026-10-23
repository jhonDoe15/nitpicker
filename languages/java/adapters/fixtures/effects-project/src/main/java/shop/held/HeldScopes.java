package shop.held;

import java.math.BigDecimal;
import java.util.concurrent.locks.ReentrantLock;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import shop.orders.OrderRepository;
import shop.prices.PriceSource;

public class HeldScopes {
  private final OrderRepository repository;
  private final PriceSource prices;
  private final TransactionTemplate transactions;
  private final ReentrantLock lock = new ReentrantLock();
  private BigDecimal last = BigDecimal.ZERO;

  public HeldScopes(OrderRepository repository, PriceSource prices, TransactionTemplate transactions) {
    this.repository = repository;
    this.prices = prices;
    this.transactions = transactions;
  }

  @Transactional
  public BigDecimal confirm(Long id) {
    repository.findById(id).orElseThrow();
    return prices.priceOf(id);
  }

  public void inTemplate(Long id) {
    transactions.executeWithoutResult(status -> {
      repository.deleteById(id);
      last = prices.priceOf(id);
    });
  }

  public synchronized void refresh(Long id) {
    last = prices.priceOf(id);
  }

  public void underLock(Long id) {
    lock.lock();
    try {
      last = prices.priceOf(id);
    } finally {
      lock.unlock();
    }
  }

  public void inBlock(Long id) {
    synchronized (this) {
      last = prices.priceOf(id);
    }
  }
}
