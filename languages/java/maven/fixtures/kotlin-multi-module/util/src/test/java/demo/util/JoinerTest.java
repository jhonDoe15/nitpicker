package demo.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class JoinerTest {
  @Test
  void joins() {
    assertEquals("a-b", Joiner.join("a", "b"));
  }
}
