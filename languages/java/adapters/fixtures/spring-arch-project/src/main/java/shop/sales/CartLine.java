package shop.sales;

import org.jmolecules.ddd.types.Entity;

public class CartLine implements Entity<Cart, Ids.LineId> {
  private Ids.LineId id;
  private Cart cart;

  @Override
  public Ids.LineId getId() {
    return id;
  }
}
