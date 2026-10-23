package shop.sales;

import java.util.List;
import java.util.Map;
import org.jmolecules.ddd.types.AggregateRoot;
import org.jmolecules.ddd.types.Association;

public class Order implements AggregateRoot<Order, Ids.OrderId> {
  private Ids.OrderId id;
  private Customer customer;
  private Association<Customer, Ids.CustomerId> buyer;
  private Ids.CustomerId payer;
  private List<LineItem> items;
  private List<Payment> payments;
  private List<CartLine> borrowed;
  private Map<String, List<Cart>> carts;
  private Address shipTo;

  @Override
  public Ids.OrderId getId() {
    return id;
  }
}
