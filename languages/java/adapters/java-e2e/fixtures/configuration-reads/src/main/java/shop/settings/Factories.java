package shop.settings;

import io.micronaut.context.annotation.Bean;
import io.micronaut.context.annotation.Factory;

@Factory
public final class Factories {
  @Bean
  String region() {
    return System.getProperty("shop.region", "eu");
  }
}
