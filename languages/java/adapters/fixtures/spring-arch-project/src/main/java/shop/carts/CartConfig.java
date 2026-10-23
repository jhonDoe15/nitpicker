package shop.carts;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Scope;

@Configuration
public class CartConfig {
  @Bean
  @Scope("request")
  Receipt receipt() {
    return new Receipt();
  }

  @Bean
  Pricing pricing(Basket basket, Receipt receipt) {
    return new Pricing(basket);
  }

  @Bean
  @Scope("request")
  Pricing requestPricing(Basket basket) {
    return new Pricing(basket);
  }
}
