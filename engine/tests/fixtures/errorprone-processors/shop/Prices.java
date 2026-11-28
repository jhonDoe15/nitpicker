package shop;

import java.util.List;

public class Prices {
  private final String unused = "x";

  public Money leaked() {
    return new AutoValue_Money("EUR", "euro", List.of());
  }

  public boolean equalPrices(Money left, Money right) {
    return left == right;
  }

  public String shout(Money money) {
    return money.currency().toUpperCase();
  }

  public OrderDto copy(Order order) {
    OrderDto dto = OrderMapper.INSTANCE.toDto(order);
    dto.equals(order);
    return new OrderMapperImpl().toDto(order);
  }

  public Money built() {
    Account.Builder builder = Account.builder();
    builder.owner("me");
    return builder.balance(Money.of("EUR", "euro")).build().balance();
  }
}
