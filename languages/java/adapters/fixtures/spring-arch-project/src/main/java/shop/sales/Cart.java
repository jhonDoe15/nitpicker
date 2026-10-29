package shop.sales;

import java.util.List;
import org.jmolecules.ddd.types.AggregateRoot;

public class Cart implements AggregateRoot<Cart, Ids.CartId> {
  private Ids.CartId id;
  private List<CartLine> lines;

  @Override
  public Ids.CartId getId() {
    return id;
  }
}
