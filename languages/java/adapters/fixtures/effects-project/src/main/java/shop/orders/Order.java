package shop.orders;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.math.BigDecimal;

@Entity
public class Order {
  @Id private Long id;
  private BigDecimal total;

  public Long getId() {
    return id;
  }

  public BigDecimal getTotal() {
    return total;
  }
}
