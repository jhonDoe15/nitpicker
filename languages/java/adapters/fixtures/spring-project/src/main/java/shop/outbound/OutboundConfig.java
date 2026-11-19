package shop.outbound;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
public class OutboundConfig {
  @Bean
  RestClient billing(RestClient.Builder builder, @Value("${billing.base-url}") String baseUrl) {
    return builder.baseUrl(baseUrl).build();
  }
}
