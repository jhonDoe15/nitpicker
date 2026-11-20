package shop.orders.integration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest
@DirtiesContext
class OwnContextIT {
  @TestConfiguration
  static class Beans {}

  @Test
  void starts() {}
}
