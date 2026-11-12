package sample;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ShoutAcceptanceTest {
  @Test
  void upperCasesTheGreeting() {
    assertEquals("HELLO, GRACE!", new Greeter().shout("grace"));
  }
}
