package shop.tree;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

@Data
public class Parcel {
  private String label;
  @ToString.Exclude @EqualsAndHashCode.Exclude private Shipment shipment;
}
