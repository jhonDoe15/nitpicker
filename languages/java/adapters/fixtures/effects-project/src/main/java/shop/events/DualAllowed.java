package shop.events;

import org.springframework.kafka.core.KafkaTemplate;
import shop.orders.Order;
import shop.orders.OrderRepository;
import shop.prices.OrderEvents;

public class DualAllowed {
  private final OrderRepository repository;
  private final OrderEvents events;
  private final KafkaTemplate<String, String> kafka;
  private final DualWrites writes;

  public DualAllowed(
      OrderRepository repository, OrderEvents events, KafkaTemplate<String, String> kafka, DualWrites writes) {
    this.repository = repository;
    this.events = events;
    this.kafka = kafka;
    this.writes = writes;
  }

  public void announce(Long id) {
    events.placed(id);
  }

  public void placeThroughHelper(Order order) {
    writes.place(order);
  }

  public void relay() {
    for (Order order : repository.findAll()) {
      kafka.send("orders", String.valueOf(order.getId()));
      repository.delete(order);
    }
  }
}
