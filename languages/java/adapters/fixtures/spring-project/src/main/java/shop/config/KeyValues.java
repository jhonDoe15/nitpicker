package shop.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class KeyValues {
  @Bean
  String keys(
      @Value("${app.rabbit.routing-key:order.created}") String routingKey,
      @Value("${app.cache.partitionKey:tenant}") String partitionKey,
      @Value("${app.sort.key:name}") String sortKey,
      @Value("${app.api.key:dev-key}") String apiKey, // violation: SpringValueSecretDefault
      @Value("${app.partner.apiKey:dev-key}") String partnerKey, // violation: SpringValueSecretDefault
      @Value("${app.jwt.signing-key:dev}") String signingKey, // violation: SpringValueSecretDefault
      @Value("${app.db.passphrase:changeit}") String passphrase) { // violation: SpringValueSecretDefault
    return routingKey;
  }
}

@ConfigurationProperties("app.queue")
record QueueProperties(
    @DefaultValue("orders") String routingKey,
    @DefaultValue("dev") String accessKey) {} // violation: SpringValueSecretDefault
