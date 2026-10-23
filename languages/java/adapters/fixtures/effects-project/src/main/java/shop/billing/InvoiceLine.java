package shop.billing;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import java.math.BigDecimal;

@Entity
public class InvoiceLine {
  @Id private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  private Invoice invoice;

  private BigDecimal amount;

  public BigDecimal getAmount() {
    return amount;
  }
}
