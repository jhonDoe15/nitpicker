package shop.sales;

import org.jmolecules.ddd.types.Entity;

public class LineItem implements Entity<Order, Ids.LineId> {
  private Ids.LineId id;
  private Order order;
  private Product product;

  @Override
  public Ids.LineId getId() {
    return id;
  }
}
