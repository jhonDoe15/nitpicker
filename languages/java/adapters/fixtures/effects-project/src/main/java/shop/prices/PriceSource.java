package shop.prices;

import java.math.BigDecimal;

public interface PriceSource {
  BigDecimal priceOf(Long id);
}
