package shop;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
@MockitoBean(types = Runnable.class)
class TypeMockTest {
  @Test
  void replacesTheBean() {
    assertThat(Status.values()).hasSize(4);
  }
}
