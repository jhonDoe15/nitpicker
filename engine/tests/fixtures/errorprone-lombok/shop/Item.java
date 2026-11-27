package shop;

import lombok.Builder;
import lombok.Data;
import lombok.Setter;

@Data
@Builder
public class Item {
  private final String name;
  @Builder.Default private int priceCents = 100;
  @Setter private String note;;

  public java.util.List<String> labels() {
    return java.util.List.of(name);
  }
}
