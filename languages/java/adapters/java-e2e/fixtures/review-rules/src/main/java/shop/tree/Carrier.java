package shop.tree;

import java.util.Set;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
public class Carrier {
  private String code;
  @EqualsAndHashCode.Exclude private Set<Shipment> shipments;
}
