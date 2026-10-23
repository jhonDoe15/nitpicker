package shop.wiring;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
  @GetMapping("/health")
  public String health() {
    return String.valueOf(new StatusEndpoint(null));
  }
}
