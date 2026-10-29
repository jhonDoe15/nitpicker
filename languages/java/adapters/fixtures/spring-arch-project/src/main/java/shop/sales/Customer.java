package shop.sales;

import org.jmolecules.ddd.types.AggregateRoot;

public class Customer implements AggregateRoot<Customer, Ids.CustomerId> {
  private Ids.CustomerId id;

  @Override
  public Ids.CustomerId getId() {
    return id;
  }
}
