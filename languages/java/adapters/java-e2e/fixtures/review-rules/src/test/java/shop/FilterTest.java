package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class FilterTest {
  @Test
  void keepsTags() {
    System.err.println("cache miss for filter 42");
    assertThat(new Filter("a", List.of("a"), "b", List.of(1L)).tags()).containsExactly("a");
  }
}
