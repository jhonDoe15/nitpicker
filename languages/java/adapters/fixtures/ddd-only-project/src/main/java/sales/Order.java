package sales;

import org.jmolecules.ddd.types.AggregateRoot;
import org.jmolecules.ddd.types.Identifier;

public class Order implements AggregateRoot<Order, Order.OrderId> {
  private OrderId id;
  private Customer customer;
  private Customer.CustomerId payer;

  @Override
  public OrderId getId() {
    return id;
  }

  public record OrderId(long value) implements Identifier {}
}
