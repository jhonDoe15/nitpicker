package shop.outbound;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@ConfigurationProperties("partner")
record PartnerProperties(URI baseUrl) {}

@Component
class PartnerClient {
  private final RestClient client;

  PartnerClient(RestClient.Builder builder, PartnerProperties properties) {
    this.client = builder.baseUrl(properties.baseUrl().toString()).build();
  }

  String rates(String currency) {
    return client.get().uri("/rates/{currency}", currency).retrieve().body(String.class);
  }
}

class Webhook {
  private final RestClient client;

  Webhook(String target) {
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(Duration.ofSeconds(2));
    factory.setReadTimeout(Duration.ofSeconds(5));
    this.client = RestClient.builder().requestFactory(factory).baseUrl(target).build(); // violation: SpringOutboundUrl
  }
}
