package sales;

import org.jmolecules.ddd.types.AggregateRoot;
import org.jmolecules.ddd.types.Identifier;

public class Customer implements AggregateRoot<Customer, Customer.CustomerId> {
  private CustomerId id;

  @Override
  public CustomerId getId() {
    return id;
  }

  public record CustomerId(long value) implements Identifier {}
}
