package shop.events;

import org.springframework.context.event.EventListener;
import org.springframework.transaction.event.TransactionalEventListener;
import shop.prices.OrderEvents;

public class OrderListeners {
  public record Placed(Long id) {}

  public record Shipped(Long id) {}

  private final OrderEvents events;

  public OrderListeners(OrderEvents events) {
    this.events = events;
  }

  @TransactionalEventListener
  public void onPlaced(Placed placed) {
    events.placed(placed.id());
  }

  @EventListener
  public void onShipped(Shipped shipped) {
    events.placed(shipped.id());
  }
}
