package shop.trash;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.time.Instant;

@Entity
public class Product {
  @Id private Long id;
  private String sku;
  private String owner;
  private Instant deletedAt;

  public Long getId() {
    return id;
  }

  public Instant getDeletedAt() {
    return deletedAt;
  }
}
