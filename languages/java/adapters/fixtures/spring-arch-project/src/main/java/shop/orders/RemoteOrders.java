package shop.orders;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class RemoteOrders {
  private final RestTemplate client;

  public RemoteOrders(RestTemplate client) {
    this.client = client;
  }

  public String fetch(String url) {
    return client.getForEntity(url, String.class).getBody();
  }
}
