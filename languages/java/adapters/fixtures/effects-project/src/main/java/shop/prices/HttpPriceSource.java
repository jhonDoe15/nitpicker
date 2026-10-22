package shop.prices;

import java.math.BigDecimal;
import org.springframework.web.client.RestClient;

public class HttpPriceSource implements PriceSource {
  private final RestClient client;

  public HttpPriceSource(RestClient client) {
    this.client = client;
  }

  @Override
  public BigDecimal priceOf(Long id) {
    return client.get().uri("/prices/{id}", id).retrieve().body(BigDecimal.class);
  }
}
