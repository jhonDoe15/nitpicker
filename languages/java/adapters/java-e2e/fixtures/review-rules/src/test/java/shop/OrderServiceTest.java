package shop;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class OrderServiceTest {
  @Autowired private OrderService service;

  @Test
  void refusesToCancelAShippedOrder() {
    assertThat(service.cancel(Status.SHIPPED)).isFalse();
    assertThat(service.cancel(Status.NEW)).isTrue();
  }
}
