package shop;

import static org.assertj.core.api.Assertions.assertThat;

import lombok.RequiredArgsConstructor;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestConstructor;
import org.springframework.test.context.TestConstructor.AutowireMode;

@SpringBootTest
@RequiredArgsConstructor
@TestConstructor(autowireMode = AutowireMode.ALL)
class GeneratedConstructorTest {
  private final OrderService service;

  @Test
  void injectsThroughTheGeneratedConstructor() {
    assertThat(service.cancel(Status.NEW)).isTrue();
  }
}
