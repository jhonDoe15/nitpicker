package shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class PausesTest {
  @Test
  void waitsOrFails() {
    CountDownLatch done = new CountDownLatch(0);
    try {
      assertThat(done.await(1, TimeUnit.SECONDS)).isTrue();
    } catch (InterruptedException e) {
      fail("interrupted", e);
    }
  }
}
