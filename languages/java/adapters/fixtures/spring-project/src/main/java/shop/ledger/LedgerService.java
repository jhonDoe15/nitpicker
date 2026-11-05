package shop.ledger;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import shop.catalog.Product;

@Service
public class LedgerService {
  private final LedgerRepository ledger;
  private final JdbcTemplate jdbc;
  private final JdbcClient client;
  private final TransactionTemplate transactions;

  public LedgerService(
      LedgerRepository ledger, JdbcTemplate jdbc, JdbcClient client, TransactionTemplate transactions) {
    this.ledger = ledger;
    this.jdbc = jdbc;
    this.client = client;
    this.transactions = transactions;
  }

  public void move(Product from, Product to) { // violation: SpringMultiWriteWithoutTransaction
    ledger.save(from);
    ledger.save(to);
  }

  public void replace(Product old, Product next) { // violation: SpringMultiWriteWithoutTransaction
    ledger.save(next);
    forget(old);
  }

  public void settle(Long id) { // violation: SpringMultiWriteWithoutTransaction
    jdbc.update("update product set version = 0 where id = ?", id);
    client.sql("delete from product_audit where product_id = :id").param("id", id).update();
  }

  public void either(Product product, boolean keep) {
    if (keep) {
      ledger.save(product);
    } else {
      ledger.delete(product);
    }
  }

  public void attempt(Product product, Product failure) {
    try {
      ledger.save(product);
    } catch (IllegalStateException e) {
      ledger.save(failure);
    }
  }

  public void once(List<Product> products) {
    ledger.saveAll(products);
  }

  @Transactional
  public void moveInTransaction(Product from, Product to) {
    ledger.save(from);
    ledger.save(to);
  }

  public void moveInTemplate(Product from, Product to) {
    transactions.executeWithoutResult(
        status -> {
          ledger.save(from);
          ledger.save(to);
        });
  }

  public Product find(Long id) {
    return ledger.findById(id).orElseThrow();
  }

  private void forget(Product product) {
    ledger.delete(product);
  }
}
