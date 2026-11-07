package shop.ledger;

import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
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
  private final NamedParameterJdbcTemplate named;
  private final EntityManager entities;

  public LedgerService(
      LedgerRepository ledger,
      JdbcTemplate jdbc,
      JdbcClient client,
      TransactionTemplate transactions,
      NamedParameterJdbcTemplate named,
      EntityManager entities) {
    this.ledger = ledger;
    this.jdbc = jdbc;
    this.client = client;
    this.transactions = transactions;
    this.named = named;
    this.entities = entities;
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

  public void tidy(Product product, Product audit) { // violation: SpringMultiWriteWithoutTransaction
    try {
      ledger.save(product);
    } finally {
      ledger.save(audit);
    }
  }

  public void forgetBoth(Product first, Product second) { // violation: SpringMultiWriteWithoutTransaction
    forget(first);
    forget(second);
  }

  public void expire(Long id) { // violation: SpringMultiWriteWithoutTransaction
    named.update("delete from product_audit where product_id = :id", Map.of("id", id));
    jdbc.batchUpdate("update product set version = 0");
  }

  public void retire(Product product) { // violation: SpringMultiWriteWithoutTransaction
    ledger.save(product);
    entities.createQuery("delete from Product p where p.version = 0").executeUpdate();
  }

  public void guard(Product product, boolean skip) {
    if (skip) {
      ledger.save(product);
      return;
    }
    ledger.delete(product);
  }

  public void check(Product product, Product failure, boolean broken) {
    if (broken) {
      ledger.save(failure);
      throw new IllegalStateException("broken");
    }
    ledger.save(product);
  }

  public void pick(Product product, int mode) {
    switch (mode) {
      case 0 -> ledger.save(product);
      default -> ledger.delete(product);
    }
  }

  public Product choose(Product first, Product second, boolean early) {
    return early ? ledger.save(first) : ledger.save(second);
  }

  public void branch(Product product, boolean keep) {
    if (keep) {
      ledger.save(product);
    } else {
      forget(product);
    }
  }

  public List<Product> recent(long version) {
    ledger.updatedSince(version);
    return ledger.updatedSince(version + 1);
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

