package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class GreeterTest {
  @Test
  void greetsByName() {
    assertEquals("Hello, Ada!", new Greeter().greet("Ada"));
  }

  @Test
  void saysFarewell() {
    assertEquals("Goodbye, Ada.", new Greeter().farewell("Ada"));
  }
}
