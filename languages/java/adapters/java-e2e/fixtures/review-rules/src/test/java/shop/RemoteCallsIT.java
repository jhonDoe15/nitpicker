package shop;

import org.springframework.web.client.RestTemplate;

class RemoteCallsIT {
  private final RestTemplate rest = new RestTemplate();

  String callsTheRealService() {
    return rest.getForObject("https://api.example.com/v1/orders", String.class);
  }
}
