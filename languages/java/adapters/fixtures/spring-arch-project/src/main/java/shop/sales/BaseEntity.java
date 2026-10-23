package shop.sales;

import org.jmolecules.ddd.types.AggregateRoot;
import org.jmolecules.ddd.types.Entity;

public abstract class BaseEntity<A extends AggregateRoot<A, ?>, I> implements Entity<A, I> {
  private I id;

  @Override
  public I getId() {
    return id;
  }
}
