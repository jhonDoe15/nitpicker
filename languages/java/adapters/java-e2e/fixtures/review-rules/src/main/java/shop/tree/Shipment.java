package shop.tree;

import java.util.List;
import lombok.Data;

@Data
public class Shipment {
  private String id;
  private List<Parcel> parcels;
  private Carrier carrier; // violation: GeneratedMemberCycle
}
