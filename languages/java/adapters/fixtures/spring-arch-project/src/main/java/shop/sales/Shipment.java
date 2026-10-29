package shop.sales;

import org.jmolecules.ddd.annotation.AggregateRoot;
import org.jmolecules.ddd.annotation.Association;
import org.jmolecules.ddd.annotation.Identity;

@AggregateRoot
public class Shipment {
  @Identity private long id;
  private Parcel parcel;
  private Label label;
  @Association private Warehouse origin;
  private Warehouse warehouse;
}
