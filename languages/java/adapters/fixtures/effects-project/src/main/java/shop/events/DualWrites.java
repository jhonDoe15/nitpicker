package shop.events;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import shop.orders.Order;
import shop.orders.OrderRepository;
import shop.prices.OrderEvents;

public class DualWrites {
  private final OrderRepository repository;
  private final OrderEvents events;
  private final ApplicationEventPublisher publisher;

  public DualWrites(OrderRepository repository, OrderEvents events, ApplicationEventPublisher publisher) {
    this.repository = repository;
    this.events = events;
    this.publisher = publisher;
  }

  public void place(Order order) {
    repository.save(order);
    events.placed(order.getId());
  }

  public void placeWithEvent(Order order) {
    repository.save(order);
    publisher.publishEvent(new OrderListeners.Placed(order.getId()));
  }

  public void ship(Order order) {
    repository.save(order);
    publisher.publishEvent(new OrderListeners.Shipped(order.getId()));
  }

  public void placeAfterCommit(Order order) {
    repository.save(order);
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
      @Override
      public void afterCommit() {
        events.placed(order.getId());
      }
    });
  }
}
