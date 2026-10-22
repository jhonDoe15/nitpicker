package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class OrdersTest {
  @Test
  void classifiesStatuses() {
    assertThat(Orders.isOpen(Status.NEW)).isTrue();
    assertThat(Orders.isOpen(Status.SHIPPED)).isFalse();
    assertThat(Orders.isDone(Status.CANCELLED)).isTrue();
    assertThat(Orders.isDone(Status.PAID)).isFalse();
    assertThat(Orders.isKnown(Status.PAID)).isTrue();
    assertThat(Orders.isLong(TimeUnit.DAYS)).isTrue();
    assertThat(Orders.isLong(TimeUnit.SECONDS)).isFalse();
    assertThat(Orders.rank(Status.PAID)).isEqualTo(1);
    assertThat(Orders.rank(Status.CANCELLED)).isEqualTo(2);
  }

  @Test
  void addsPrices() {
    assertThat(Orders.total(SampleOrders.cents())).isEqualTo(350L);
    assertThat(Orders.withFee(SampleOrders.cents())).isEqualTo(400L);
  }
}
