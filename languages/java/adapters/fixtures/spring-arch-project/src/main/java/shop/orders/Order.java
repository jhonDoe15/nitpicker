package shop.orders;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class Order {
  @Id private Long id;

  public Long id() {
    return id;
  }
}
