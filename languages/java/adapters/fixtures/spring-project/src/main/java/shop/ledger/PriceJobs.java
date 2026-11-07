package shop.ledger;

import com.google.common.cache.Cache;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import shop.catalog.Product;

@Component
public class PriceJobs {
  private final LedgerRepository ledger;
  private final Cache<String, Product> recent;
  private final TransactionTemplate transactions;

  public PriceJobs(LedgerRepository ledger, Cache<String, Product> recent, TransactionTemplate transactions) {
    this.ledger = ledger;
    this.recent = recent;
    this.transactions = transactions;
  }

  public void run(String name, Product product) {
    transactions.executeWithoutResult(
        status -> {
          ledger.save(product);
          recent.invalidate(name); // violation: SpringLocalCacheWriteInTransaction
        });
    recent.put(name, product);
  }
}
