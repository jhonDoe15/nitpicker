package shop;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class ShopApplication {
  @Bean
  String greeting(@Value("${shop.greeting}") String greeting) {
    return greeting;
  }
}
