package shop.carts;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.time.Instant;

@Entity
public class Item {
  @Id private Long id;
  private int quantity;
  private int price;
  private Instant deletedAt;

  public Long getId() {
    return id;
  }

  public int getQuantity() {
    return quantity;
  }

  public int getPrice() {
    return price;
  }

  public Instant getDeletedAt() {
    return deletedAt;
  }
}
