package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class PricesTest { // violation: SpringUnusedContext
  @Test
  void sums() {
    assertThat(Prices.sum(List.of(1L, 2L))).isEqualTo(3L);
  }
}
