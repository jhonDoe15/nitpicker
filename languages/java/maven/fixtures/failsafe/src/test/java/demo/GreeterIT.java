package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class GreeterIT {
  @Test
  void saysGoodbye() {
    assertEquals("Goodbye, Ada", new Greeter().farewell("Ada"));
  }
}
