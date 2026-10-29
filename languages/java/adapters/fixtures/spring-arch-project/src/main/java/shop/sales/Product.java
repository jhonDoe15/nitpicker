package shop.sales;

import org.jmolecules.ddd.types.AggregateRoot;

public class Product implements AggregateRoot<Product, Ids.ProductId> {
  private Ids.ProductId id;

  @Override
  public Ids.ProductId getId() {
    return id;
  }
}
