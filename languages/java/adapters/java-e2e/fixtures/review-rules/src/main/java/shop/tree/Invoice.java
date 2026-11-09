package shop.tree;

import java.math.BigDecimal;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
public class Invoice extends Audited { // violation: GeneratedEqualsSkipsSuperclass
  private BigDecimal total;

  @Data
  @EqualsAndHashCode(callSuper = true)
  public static class Refund extends Audited {
    private BigDecimal amount;
  }
}
