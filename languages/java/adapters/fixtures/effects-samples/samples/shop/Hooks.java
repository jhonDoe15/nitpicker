package shop;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class Hooks {
  OrderRepository repo;
  Gateway gateway;

  @Transactional
  public void afterTransaction(Order order) {
    repo.save(order);
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            gateway.fetch(order.getId());
          }
        });
  }
}
