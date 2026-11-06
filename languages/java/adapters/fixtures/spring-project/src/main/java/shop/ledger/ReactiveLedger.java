package shop.ledger;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import shop.catalog.Product;

@Service
public class ReactiveLedger {
  private final ReactiveCrudRepository<Product, Long> ledger;
  private final TransactionalOperator transactions;

  public ReactiveLedger(ReactiveCrudRepository<Product, Long> ledger, TransactionalOperator transactions) {
    this.ledger = ledger;
    this.transactions = transactions;
  }

  public Mono<Product> move(Product from, Product to) { // violation: SpringMultiWriteWithoutTransaction
    return ledger.save(from).then(ledger.save(to));
  }

  public Mono<Product> moveInTransaction(Product from, Product to) {
    return ledger.save(from).then(ledger.save(to)).as(transactions::transactional);
  }
}
