package shop.sales;

import java.util.Set;
import org.jmolecules.ddd.annotation.AggregateRoot;
import org.jmolecules.ddd.annotation.Identity;

@AggregateRoot
public class Warehouse {
  @Identity private long id;
  private Set<Parcel> stock;
}
