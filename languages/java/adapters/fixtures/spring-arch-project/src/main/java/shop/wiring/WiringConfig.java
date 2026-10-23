package shop.wiring;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;

@Configuration
public class WiringConfig {
  @Bean
  @Lazy
  Object audit(Wallet wallet) {
    return wallet;
  }
}
